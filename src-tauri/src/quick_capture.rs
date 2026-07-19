use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    str::FromStr,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const TRANSLATION_EVENT: &str = "quick-translation-captured";
const EXPLANATION_EVENT: &str = "quick-explanation-captured";
const DEFAULT_TRANSLATION_SHORTCUT: &str = "CommandOrControl+Shift+Space";
const DEFAULT_EXPLANATION_SHORTCUT: &str = "CommandOrControl+Shift+KeyE";
const CONFIG_FILE: &str = "quick-capture.json";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickCaptureStatus {
    pub registered: bool,
    pub shortcut: String,
    pub shortcut_value: String,
    pub message: String,
}

#[derive(Clone)]
struct QuickCaptureStatuses {
    translation: QuickCaptureStatus,
    explanation: QuickCaptureStatus,
}

pub struct QuickCaptureState {
    statuses: Mutex<QuickCaptureStatuses>,
    latest_payloads: Mutex<QuickCapturePayloads>,
    next_payload_id: AtomicU64,
    recording_shortcut: AtomicBool,
}

#[derive(Default)]
struct QuickCapturePayloads {
    translation: Option<QuickCapturePayload>,
    explanation: Option<QuickCapturePayload>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum CaptureKind {
    Translation,
    Explanation,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct QuickCaptureConfig {
    translation_shortcut: String,
    explanation_shortcut: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct QuickCaptureConfigFile {
    shortcut: Option<String>,
    translation_shortcut: Option<String>,
    explanation_shortcut: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickCapturePayload {
    id: u64,
    text: Option<String>,
    error: Option<String>,
    shortcut: String,
}

impl QuickCaptureState {
    fn new(translation: QuickCaptureStatus, explanation: QuickCaptureStatus) -> Self {
        Self {
            statuses: Mutex::new(QuickCaptureStatuses {
                translation,
                explanation,
            }),
            latest_payloads: Mutex::new(QuickCapturePayloads::default()),
            next_payload_id: AtomicU64::new(1),
            recording_shortcut: AtomicBool::new(false),
        }
    }

    pub fn translation_status(&self) -> QuickCaptureStatus {
        self.status(CaptureKind::Translation)
    }

    pub fn explanation_status(&self) -> QuickCaptureStatus {
        self.status(CaptureKind::Explanation)
    }

    fn status(&self, kind: CaptureKind) -> QuickCaptureStatus {
        let statuses = self
            .statuses
            .lock()
            .expect("quick capture status lock poisoned");
        match kind {
            CaptureKind::Translation => statuses.translation.clone(),
            CaptureKind::Explanation => statuses.explanation.clone(),
        }
    }

    fn replace_status(&self, kind: CaptureKind, status: QuickCaptureStatus) {
        let mut statuses = self
            .statuses
            .lock()
            .expect("quick capture status lock poisoned");
        match kind {
            CaptureKind::Translation => statuses.translation = status,
            CaptureKind::Explanation => statuses.explanation = status,
        }
    }

    fn begin_recording_shortcut(&self) -> bool {
        !self.recording_shortcut.swap(true, Ordering::AcqRel)
    }

    fn finish_recording_shortcut(&self) -> bool {
        self.recording_shortcut.swap(false, Ordering::AcqRel)
    }

    fn is_recording_shortcut(&self) -> bool {
        self.recording_shortcut.load(Ordering::Acquire)
    }

    fn next_payload_id(&self) -> u64 {
        self.next_payload_id.fetch_add(1, Ordering::Relaxed)
    }

    fn replace_payload(&self, kind: CaptureKind, payload: QuickCapturePayload) {
        let mut payloads = self
            .latest_payloads
            .lock()
            .expect("quick capture payload lock poisoned");
        match kind {
            CaptureKind::Translation => payloads.translation = Some(payload),
            CaptureKind::Explanation => payloads.explanation = Some(payload),
        }
    }

    pub fn latest_translation_payload(&self) -> Option<QuickCapturePayload> {
        self.latest_payload(CaptureKind::Translation)
    }

    pub fn latest_explanation_payload(&self) -> Option<QuickCapturePayload> {
        self.latest_payload(CaptureKind::Explanation)
    }

    fn latest_payload(&self, kind: CaptureKind) -> Option<QuickCapturePayload> {
        let payloads = self
            .latest_payloads
            .lock()
            .expect("quick capture payload lock poisoned");
        match kind {
            CaptureKind::Translation => payloads.translation.clone(),
            CaptureKind::Explanation => payloads.explanation.clone(),
        }
    }
}

pub fn register(app: &mut tauri::App) -> QuickCaptureState {
    let config = load_config(app).unwrap_or_else(|_| default_config());
    let plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_handler(move |app, shortcut, event| {
            if app
                .state::<QuickCaptureState>()
                .is_recording_shortcut()
            {
                return;
            }

            // Wait until all modifier keys are released. The macOS clipboard fallback
            // sends Command+C and can fail if the original shortcut is still held.
            if event.state() != ShortcutState::Released {
                return;
            }

            let app = app.clone();
            let shortcut = shortcut.clone();
            std::thread::spawn(move || capture_selection(app, shortcut));
        })
        .build();

    if let Err(error) = app.handle().plugin(plugin) {
        let message = format!("快捷键插件初始化失败：{error}");
        return QuickCaptureState::new(
            unavailable_status(&config.translation_shortcut, message.clone()),
            unavailable_status(&config.explanation_shortcut, message),
        );
    }

    let translation = register_configured_shortcut(
        app.handle(),
        &config.translation_shortcut,
        DEFAULT_TRANSLATION_SHORTCUT,
        CaptureKind::Translation,
    );
    let explanation_shortcut = parse_shortcut(&config.explanation_shortcut);
    let translation_shortcut = parse_shortcut(&translation.shortcut_value);
    let explanation = if explanation_shortcut.is_ok()
        && translation_shortcut.is_ok()
        && explanation_shortcut.as_ref().ok() == translation_shortcut.as_ref().ok()
    {
        unavailable_status(
            &config.explanation_shortcut,
            "划词理解快捷键不能与快速翻译相同".to_string(),
        )
    } else {
        register_configured_shortcut(
            app.handle(),
            &config.explanation_shortcut,
            DEFAULT_EXPLANATION_SHORTCUT,
            CaptureKind::Explanation,
        )
    };

    QuickCaptureState::new(translation, explanation)
}

pub fn update_translation_shortcut(
    app: &AppHandle,
    state: &QuickCaptureState,
    shortcut_value: String,
) -> Result<QuickCaptureStatus, String> {
    update_shortcut(app, state, CaptureKind::Translation, shortcut_value)
}

pub fn update_explanation_shortcut(
    app: &AppHandle,
    state: &QuickCaptureState,
    shortcut_value: String,
) -> Result<QuickCaptureStatus, String> {
    update_shortcut(app, state, CaptureKind::Explanation, shortcut_value)
}

pub fn set_shortcut_recording(
    app: &AppHandle,
    state: &QuickCaptureState,
    recording: bool,
) -> Result<(), String> {
    if recording {
        if !state.begin_recording_shortcut() {
            return Ok(());
        }
        if let Err(error) = unregister_active_shortcuts(app, state) {
            state.finish_recording_shortcut();
            return Err(error);
        }
        return Ok(());
    }

    if state.finish_recording_shortcut() {
        restore_active_shortcuts(app, state);
    }
    Ok(())
}

fn update_shortcut(
    app: &AppHandle,
    state: &QuickCaptureState,
    kind: CaptureKind,
    shortcut_value: String,
) -> Result<QuickCaptureStatus, String> {
    let shortcut_value = shortcut_value.trim().to_string();
    let next_shortcut = parse_shortcut(&shortcut_value)?;
    let previous_status = state.status(kind);
    let other_status = state.status(match kind {
        CaptureKind::Translation => CaptureKind::Explanation,
        CaptureKind::Explanation => CaptureKind::Translation,
    });

    if other_status.registered
        && parse_shortcut(&other_status.shortcut_value).is_ok_and(|value| value == next_shortcut)
    {
        return Err("两个功能不能使用相同的快捷键".to_string());
    }

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

    let config = match kind {
        CaptureKind::Translation => QuickCaptureConfig {
            translation_shortcut: shortcut_value.clone(),
            explanation_shortcut: other_status.shortcut_value,
        },
        CaptureKind::Explanation => QuickCaptureConfig {
            translation_shortcut: other_status.shortcut_value,
            explanation_shortcut: shortcut_value.clone(),
        },
    };
    if let Err(error) = save_config(app, &config) {
        let _ = app.global_shortcut().unregister(next_shortcut);
        restore_previous_shortcut(app, &previous_status);
        return Err(error);
    }

    let status = ready_status(&shortcut_value, next_shortcut, kind);
    state.replace_status(kind, status.clone());
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
        TRANSLATION_EVENT,
        QuickCapturePayload {
            id: 0,
            text: Some(text),
            error: None,
            shortcut: "快速翻译窗口".to_string(),
        },
    )
    .map_err(|error| format!("无法打开完整工作台：{error}"))?;
    hide_window(app, "quick-translator");
    Ok(())
}

pub fn hide_quick_translator(app: &AppHandle) {
    hide_window(app, "quick-translator");
}

pub fn hide_quick_explainer(app: &AppHandle) {
    hide_window(app, "quick-explainer");
}

fn capture_selection(app: AppHandle, shortcut: Shortcut) {
    let state = app.state::<QuickCaptureState>();
    let kind = resolve_capture_kind(state.inner(), shortcut);
    let status = state.status(kind);
    let payload = match crate::selection_capture::capture_selected_text() {
        Ok(selected_text) => QuickCapturePayload {
            id: state.next_payload_id(),
            text: Some(selected_text),
            error: None,
            shortcut: status.shortcut,
        },
        Err(error) => QuickCapturePayload {
            id: state.next_payload_id(),
            text: None,
            error: Some(error.user_message()),
            shortcut: status.shortcut,
        },
    };

    let (window, event) = match kind {
        CaptureKind::Translation => ("quick-translator", TRANSLATION_EVENT),
        CaptureKind::Explanation => ("quick-explainer", EXPLANATION_EVENT),
    };
    state.replace_payload(kind, payload.clone());
    show_window(&app, window);
    // A hidden macOS WebView may resume after the native window is already visible.
    // Give its event loop a brief chance to wake up; the frontend also pulls the
    // cached payload again whenever the window gains focus.
    std::thread::sleep(Duration::from_millis(120));
    let _ = app.emit_to(window, event, payload);
}

fn resolve_capture_kind(state: &QuickCaptureState, shortcut: Shortcut) -> CaptureKind {
    let explanation = state.explanation_status();
    if explanation.registered
        && parse_shortcut(&explanation.shortcut_value).is_ok_and(|value| value == shortcut)
    {
        CaptureKind::Explanation
    } else {
        CaptureKind::Translation
    }
}

fn show_window(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.center();
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn hide_window(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.hide();
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

fn register_configured_shortcut(
    app: &AppHandle,
    configured_value: &str,
    default_value: &str,
    kind: CaptureKind,
) -> QuickCaptureStatus {
    match parse_shortcut(configured_value) {
        Ok(shortcut) => match app.global_shortcut().register(shortcut) {
            Ok(()) => ready_status(configured_value, shortcut, kind),
            Err(error) => unavailable_status(
                configured_value,
                format!("快捷键注册失败，可能已被其他应用占用：{error}"),
            ),
        },
        Err(error) => {
            let fallback = Shortcut::from_str(default_value)
                .expect("default quick capture shortcut must be valid");
            match app.global_shortcut().register(fallback) {
                Ok(()) => ready_status(default_value, fallback, kind),
                Err(register_error) => unavailable_status(
                    default_value,
                    format!("快捷键配置无效（{error}），默认快捷键也无法注册：{register_error}"),
                ),
            }
        }
    }
}

fn ready_status(value: &str, shortcut: Shortcut, kind: CaptureKind) -> QuickCaptureStatus {
    QuickCaptureStatus {
        registered: true,
        shortcut: format_shortcut(shortcut),
        shortcut_value: value.to_string(),
        message: match kind {
            CaptureKind::Translation => {
                "在任意应用选中文字后按快捷键，打开中英互译小窗口".to_string()
            }
            CaptureKind::Explanation => {
                "在任意应用选中文字后按快捷键，打开中文划词解读窗口".to_string()
            }
        },
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

fn default_config() -> QuickCaptureConfig {
    QuickCaptureConfig {
        translation_shortcut: DEFAULT_TRANSLATION_SHORTCUT.to_string(),
        explanation_shortcut: DEFAULT_EXPLANATION_SHORTCUT.to_string(),
    }
}

fn load_config(app: &impl Manager<tauri::Wry>) -> Result<QuickCaptureConfig, String> {
    let path = config_path(app)?;
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("无法读取快捷键配置 {}：{error}", path.display()))?;
    parse_config(&content)
}

fn parse_config(content: &str) -> Result<QuickCaptureConfig, String> {
    let file: QuickCaptureConfigFile =
        serde_json::from_str(content).map_err(|error| format!("快捷键配置格式错误：{error}"))?;
    Ok(QuickCaptureConfig {
        translation_shortcut: file
            .translation_shortcut
            .or(file.shortcut)
            .unwrap_or_else(|| DEFAULT_TRANSLATION_SHORTCUT.to_string()),
        explanation_shortcut: file
            .explanation_shortcut
            .unwrap_or_else(|| DEFAULT_EXPLANATION_SHORTCUT.to_string()),
    })
}

fn save_config(app: &impl Manager<tauri::Wry>, config: &QuickCaptureConfig) -> Result<(), String> {
    let path = config_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("无法创建配置目录：{error}"))?;
    }
    let content = serde_json::to_string_pretty(config)
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

fn unregister_active_shortcuts(
    app: &AppHandle,
    state: &QuickCaptureState,
) -> Result<(), String> {
    let translation = state.translation_status();
    let explanation = state.explanation_status();
    let mut unregistered = Vec::new();

    for status in [translation, explanation] {
        if !status.registered {
            continue;
        }
        if let Err(error) = app.global_shortcut().unregister(status.shortcut_value.as_str()) {
            for previous in unregistered {
                restore_previous_shortcut(app, &previous);
            }
            return Err(format!("无法暂停当前快捷键：{error}"));
        }
        unregistered.push(status);
    }
    Ok(())
}

fn restore_active_shortcuts(app: &AppHandle, state: &QuickCaptureState) {
    restore_previous_shortcut(app, &state.translation_status());
    restore_previous_shortcut(app, &state.explanation_status());
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

    #[test]
    fn migrates_legacy_translation_shortcut() {
        let config = parse_config(r#"{"shortcut":"Command+Shift+KeyT"}"#).unwrap();
        assert_eq!(config.translation_shortcut, "Command+Shift+KeyT");
        assert_eq!(config.explanation_shortcut, DEFAULT_EXPLANATION_SHORTCUT);
    }

    #[test]
    fn ignores_global_capture_while_recording_a_shortcut() {
        let status = unavailable_status("Option+Digit1", "测试".to_string());
        let state = QuickCaptureState::new(status.clone(), status);

        assert!(!state.is_recording_shortcut());
        assert!(state.begin_recording_shortcut());
        assert!(state.is_recording_shortcut());
        assert!(state.finish_recording_shortcut());
        assert!(!state.is_recording_shortcut());
    }
}
