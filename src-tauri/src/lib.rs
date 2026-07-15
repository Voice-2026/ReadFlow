mod ai;
mod quick_capture;

use tauri::Manager;

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
    status.status()
}

#[tauri::command]
fn update_quick_capture_shortcut(
    app: tauri::AppHandle,
    status: tauri::State<'_, quick_capture::QuickCaptureState>,
    shortcut: String,
) -> Result<quick_capture::QuickCaptureStatus, String> {
    quick_capture::update_shortcut(&app, status.inner(), shortcut)
}

#[tauri::command]
fn open_translation_workbench(app: tauri::AppHandle, text: String) -> Result<(), String> {
    quick_capture::open_translation_workbench(&app, text)
}

#[tauri::command]
fn hide_quick_translator(app: tauri::AppHandle) {
    quick_capture::hide_quick_translator(&app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
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
            update_quick_capture_shortcut,
            open_translation_workbench,
            hide_quick_translator
        ])
        .on_window_event(|window, event| {
            if window.label() == "quick-translator" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run ReadFlow");
}
