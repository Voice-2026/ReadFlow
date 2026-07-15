use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, str::FromStr, sync::Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const CAPTURE_EVENT: &str = "quick-translation-captured";
const DEFAULT_SHORTCUT: &str = "CommandOrControl+Shift+Space";
const CONFIG_FILE: &str = "quick-capture.json";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickCaptureStatus {
    pub registered: bool,
    pub shortcut: String,
    pub shortcut_value: String,
    pub message: String,
}

pub struct QuickCaptureState {
    status: Mutex<QuickCaptureStatus>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct QuickCaptureConfig {
    shortcut: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct QuickCapturePayload {
    text: Option<String>,
    error: Option<String>,
    shortcut: String,
}

impl QuickCaptureState {
    pub fn new(status: QuickCaptureStatus) -> Self {
        Self {
            status: Mutex::new(status),
        }
    }

    pub fn status(&self) -> QuickCaptureStatus {
        self.status
            .lock()
            .expect("quick capture status lock poisoned")
            .clone()
    }

    fn replace_status(&self, status: QuickCaptureStatus) {
        *self
            .status
            .lock()
            .expect("quick capture status lock poisoned") = status;
    }
}

pub fn register(app: &mut tauri::App) -> QuickCaptureState {
    let configured_value = load_config(app)
        .map(|config| config.shortcut)
        .unwrap_or_else(|_| DEFAULT_SHORTCUT.to_string());
    let plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_handler(move |app, _, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }

            let app = app.clone();
            std::thread::spawn(move || capture_selection(app));
        })
        .build();

    if let Err(error) = app.handle().plugin(plugin) {
        return QuickCaptureState::new(unavailable_status(
            &configured_value,
            format!("快捷键插件初始化失败：{error}"),
        ));
    }

    let status = match parse_shortcut(&configured_value) {
        Ok(shortcut) => match app.global_shortcut().register(shortcut) {
            Ok(()) => ready_status(&configured_value, shortcut),
            Err(error) => unavailable_status(
                &configured_value,
                format!("快捷键注册失败，可能已被其他应用占用：{error}"),
            ),
        },
        Err(error) => {
            let fallback = Shortcut::from_str(DEFAULT_SHORTCUT)
                .expect("default quick capture shortcut must be valid");
            match app.global_shortcut().register(fallback) {
                Ok(()) => ready_status(DEFAULT_SHORTCUT, fallback),
                Err(register_error) => unavailable_status(
                    DEFAULT_SHORTCUT,
                    format!("快捷键配置无效（{error}），默认快捷键也无法注册：{register_error}"),
                ),
            }
        }
    };

    QuickCaptureState::new(status)
}

pub fn update_shortcut(
    app: &AppHandle,
    state: &QuickCaptureState,
    shortcut_value: String,
) -> Result<QuickCaptureStatus, String> {
    let shortcut_value = shortcut_value.trim().to_string();
    let next_shortcut = parse_shortcut(&shortcut_value)?;
    let previous_status = state.status();

    if previous_status.registered && previous_status.shortcut_value == shortcut_value {
        return Ok(previous_status);
    }

    if previous_status.registered {
        app.global_shortcut()
            .unregister(previous_status.shortcut_value.as_str())
            .map_err(|error| format!("无法注销原快捷键：{error}"))?;
    }

    if let Err(error) = app.global_shortcut().register(next_shortcut) {
        restore_previous_shortcut(app, &previous_status);
        return Err(format!("新快捷键注册失败，可能已被其他应用占用：{error}"));
    }

    if let Err(error) = save_config(app, &shortcut_value) {
        let _ = app.global_shortcut().unregister(next_shortcut);
        restore_previous_shortcut(app, &previous_status);
        return Err(error);
    }

    let status = ready_status(&shortcut_value, next_shortcut);
    state.replace_status(status.clone());
    Ok(status)
}

pub fn open_translation_workbench(app: &AppHandle, text: String) -> Result<(), String> {
    let text = text.trim().to_string();
    if text.is_empty() {
        return Err("没有可带入工作台的原文".to_string());
    }

    show_window(app, "main");
    app.emit_to(
        "main",
        CAPTURE_EVENT,
        QuickCapturePayload {
            text: Some(text),
            error: None,
            shortcut: "快速翻译窗口".to_string(),
        },
    )
    .map_err(|error| format!("无法打开完整工作台：{error}"))?;
    hide_quick_translator(app);
    Ok(())
}

pub fn hide_quick_translator(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("quick-translator") {
        let _ = window.hide();
    }
}

fn capture_selection(app: AppHandle) {
    let status = app.state::<QuickCaptureState>().status();
    let selected_text = get_selected_text();
    let payload = if selected_text.is_empty() {
        QuickCapturePayload {
            text: None,
            error: Some(
                "没有捕获到选中文字。请先选择文本；若仍失败，请在“系统设置 → 隐私与安全性 → 辅助功能”中允许 ReadFlow。"
                    .to_string(),
            ),
            shortcut: status.shortcut,
        }
    } else {
        QuickCapturePayload {
            text: Some(selected_text),
            error: None,
            shortcut: status.shortcut,
        }
    };

    show_window(&app, "quick-translator");
    let _ = app.emit_to("quick-translator", CAPTURE_EVENT, payload);
}

#[cfg(target_os = "macos")]
fn get_selected_text() -> String {
    selection::get_text().trim().to_string()
}

#[cfg(not(target_os = "macos"))]
fn get_selected_text() -> String {
    String::new()
}

fn show_window(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.center();
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn parse_shortcut(value: &str) -> Result<Shortcut, String> {
    let shortcut =
        Shortcut::from_str(value).map_err(|error| format!("快捷键格式无法识别：{error}"))?;
    let required_modifiers = Modifiers::SUPER | Modifiers::CONTROL | Modifiers::ALT;
    if !shortcut.mods.intersects(required_modifiers) {
        return Err("快捷键至少需要包含 Command、Control 或 Option 中的一项".to_string());
    }
    Ok(shortcut)
}

fn ready_status(value: &str, shortcut: Shortcut) -> QuickCaptureStatus {
    QuickCaptureStatus {
        registered: true,
        shortcut: format_shortcut(shortcut),
        shortcut_value: value.to_string(),
        message: "在任意应用选中文字后按快捷键，直接打开中英互译小窗口".to_string(),
    }
}

fn unavailable_status(value: &str, message: String) -> QuickCaptureStatus {
    QuickCaptureStatus {
        registered: false,
        shortcut: value.to_string(),
        shortcut_value: value.to_string(),
        message,
    }
}

fn format_shortcut(shortcut: Shortcut) -> String {
    let mut label = String::new();
    if shortcut.mods.contains(Modifiers::SUPER) {
        label.push('⌘');
    }
    if shortcut.mods.contains(Modifiers::CONTROL) {
        label.push('⌃');
    }
    if shortcut.mods.contains(Modifiers::ALT) {
        label.push('⌥');
    }
    if shortcut.mods.contains(Modifiers::SHIFT) {
        label.push('⇧');
    }

    let key = shortcut.key.to_string();
    label.push_str(
        key.strip_prefix("Key")
            .or_else(|| key.strip_prefix("Digit"))
            .unwrap_or(&key),
    );
    label
}

fn config_path(app: &impl Manager<tauri::Wry>) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join(CONFIG_FILE))
        .map_err(|error| format!("无法定位快捷键配置目录：{error}"))
}

fn load_config(app: &impl Manager<tauri::Wry>) -> Result<QuickCaptureConfig, String> {
    let path = config_path(app)?;
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("无法读取快捷键配置 {}：{error}", path.display()))?;
    serde_json::from_str(&content).map_err(|error| format!("快捷键配置格式错误：{error}"))
}

fn save_config(app: &impl Manager<tauri::Wry>, shortcut: &str) -> Result<(), String> {
    let path = config_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("无法创建配置目录：{error}"))?;
    }
    let content = serde_json::to_string_pretty(&QuickCaptureConfig {
        shortcut: shortcut.to_string(),
    })
    .map_err(|error| format!("无法序列化快捷键配置：{error}"))?;
    fs::write(path, content).map_err(|error| format!("无法保存快捷键配置：{error}"))
}

fn restore_previous_shortcut(app: &AppHandle, status: &QuickCaptureStatus) {
    if status.registered {
        let _ = app
            .global_shortcut()
            .register(status.shortcut_value.as_str());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_shortcuts_without_command_control_or_option() {
        assert!(parse_shortcut("Shift+Space").is_err());
    }

    #[test]
    fn formats_macos_shortcut_label() {
        let shortcut = Shortcut::from_str("Command+Shift+Space").unwrap();
        assert_eq!(format_shortcut(shortcut), "⌘⇧Space");
    }
}
