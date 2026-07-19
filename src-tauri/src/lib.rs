mod ai;
mod quick_capture;
mod selection_capture;

use tauri::Manager;

#[tauri::command]
fn open_accessibility_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .spawn()
            .map_err(|error| format!("无法打开辅助功能设置：{error}"))?;
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    Err("辅助功能设置跳转仅支持 macOS".to_string())
}

#[tauri::command]
fn get_ai_configuration_status(
    app: tauri::AppHandle,
    provider: Option<String>,
) -> Result<ai::AiConfigurationStatus, String> {
    ai::configuration_status(&app, provider)
}

#[tauri::command]
fn clear_ai_api_key(
    app: tauri::AppHandle,
    provider: String,
) -> Result<ai::AiConfigurationStatus, String> {
    ai::clear_api_key(&app, provider)
}

#[tauri::command]
async fn execute_ai_task(
    app: tauri::AppHandle,
    request: ai::AiTaskRequest,
) -> Result<serde_json::Value, String> {
    ai::execute(&app, request).await
}

#[tauri::command]
fn save_ai_configuration(
    app: tauri::AppHandle,
    provider: String,
    base_url: String,
    model: String,
    api_key: Option<String>,
) -> Result<ai::AiConfigurationStatus, String> {
    ai::save_configuration(&app, provider, base_url, model, api_key)
}

#[tauri::command]
async fn test_ai_configuration(
    app: tauri::AppHandle,
    provider: Option<String>,
) -> Result<String, String> {
    ai::test_configuration(&app, provider).await
}

#[tauri::command]
fn get_quick_capture_status(
    status: tauri::State<'_, quick_capture::QuickCaptureState>,
) -> quick_capture::QuickCaptureStatus {
    status.translation_status()
}

#[tauri::command]
fn get_quick_explanation_status(
    status: tauri::State<'_, quick_capture::QuickCaptureState>,
) -> quick_capture::QuickCaptureStatus {
    status.explanation_status()
}

#[tauri::command]
fn get_latest_quick_translation_payload(
    status: tauri::State<'_, quick_capture::QuickCaptureState>,
) -> Option<quick_capture::QuickCapturePayload> {
    status.latest_translation_payload()
}

#[tauri::command]
fn get_latest_quick_explanation_payload(
    status: tauri::State<'_, quick_capture::QuickCaptureState>,
) -> Option<quick_capture::QuickCapturePayload> {
    status.latest_explanation_payload()
}

#[tauri::command]
fn update_quick_capture_shortcut(
    app: tauri::AppHandle,
    status: tauri::State<'_, quick_capture::QuickCaptureState>,
    shortcut: String,
) -> Result<quick_capture::QuickCaptureStatus, String> {
    quick_capture::update_translation_shortcut(&app, status.inner(), shortcut)
}

#[tauri::command]
fn update_quick_explanation_shortcut(
    app: tauri::AppHandle,
    status: tauri::State<'_, quick_capture::QuickCaptureState>,
    shortcut: String,
) -> Result<quick_capture::QuickCaptureStatus, String> {
    quick_capture::update_explanation_shortcut(&app, status.inner(), shortcut)
}

#[tauri::command]
fn set_quick_capture_recording(
    app: tauri::AppHandle,
    status: tauri::State<'_, quick_capture::QuickCaptureState>,
    recording: bool,
) -> Result<(), String> {
    quick_capture::set_shortcut_recording(&app, status.inner(), recording)
}

#[tauri::command]
fn open_translation_workbench(app: tauri::AppHandle, text: String) -> Result<(), String> {
    quick_capture::open_translation_workbench(&app, text)
}

#[tauri::command]
fn hide_quick_translator(app: tauri::AppHandle) {
    quick_capture::hide_quick_translator(&app);
}

#[tauri::command]
fn hide_quick_explainer(app: tauri::AppHandle) {
    quick_capture::hide_quick_explainer(&app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let quick_capture_status = quick_capture::register(app);
            app.manage(quick_capture_status);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_ai_configuration_status,
            execute_ai_task,
            save_ai_configuration,
            clear_ai_api_key,
            test_ai_configuration,
            get_quick_capture_status,
            get_quick_explanation_status,
            get_latest_quick_translation_payload,
            get_latest_quick_explanation_payload,
            update_quick_capture_shortcut,
            update_quick_explanation_shortcut,
            set_quick_capture_recording,
            open_translation_workbench,
            hide_quick_translator,
            hide_quick_explainer,
            open_accessibility_settings
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to build ReadFlow");

    app.run(|app_handle, event| {
        #[cfg(target_os = "macos")]
        if matches!(event, tauri::RunEvent::Reopen { .. }) {
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }
    });
}
