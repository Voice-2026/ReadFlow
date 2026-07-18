#[derive(Debug, PartialEq, Eq)]
pub enum CaptureError {
    PermissionDenied,
    NoSelection,
    CaptureFailed(String),
}

impl CaptureError {
    pub fn user_message(&self) -> String {
        match self {
            Self::PermissionDenied => "ReadFlow 当前进程没有辅助功能权限。请完全退出 ReadFlow，在“系统设置 → 隐私与安全性 → 辅助功能”中删除旧的 ReadFlow 条目，再重新添加 /Applications/ReadFlow.app、打开开关并重启应用。".to_string(),
            Self::NoSelection => "没有捕获到选中文字。请先选择可复制的文本，再按快捷键。".to_string(),
            Self::CaptureFailed(reason) => format!("捕获选中文字失败：{reason}"),
        }
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::{classify_clipboard_text, finalize_clipboard_capture, CaptureError};
    use accessibility_ng::{AXAttribute, AXUIElement};
    use accessibility_sys_ng::{
        kAXFocusedUIElementAttribute, kAXSelectedTextAttribute, AXIsProcessTrusted,
    };
    use arboard::{Clipboard, ImageData};
    use core_foundation::string::CFString;
    use enigo::{
        Direction::{Click, Press, Release},
        Enigo, Key, Keyboard, Settings,
    };
    use std::{borrow::Cow, thread, time::Duration};

    const COPY_ATTEMPTS: usize = 12;
    const COPY_POLL_INTERVAL: Duration = Duration::from_millis(25);

    enum ClipboardSnapshot {
        Text(String),
        Image {
            width: usize,
            height: usize,
            bytes: Vec<u8>,
        },
        Empty,
    }

    struct ClipboardSession {
        clipboard: Clipboard,
        snapshot: Option<ClipboardSnapshot>,
    }

    impl ClipboardSession {
        fn new() -> Result<Self, CaptureError> {
            let mut clipboard = Clipboard::new().map_err(|error| {
                CaptureError::CaptureFailed(format!("无法访问系统剪贴板：{error}"))
            })?;
            let snapshot = if let Ok(text) = clipboard.get_text() {
                ClipboardSnapshot::Text(text)
            } else if let Ok(image) = clipboard.get_image() {
                ClipboardSnapshot::Image {
                    width: image.width,
                    height: image.height,
                    bytes: image.bytes.into_owned(),
                }
            } else {
                ClipboardSnapshot::Empty
            };
            Ok(Self {
                clipboard,
                snapshot: Some(snapshot),
            })
        }

        fn set_text(&mut self, text: &str) -> Result<(), CaptureError> {
            self.clipboard.set_text(text.to_string()).map_err(|error| {
                CaptureError::CaptureFailed(format!("无法准备系统剪贴板：{error}"))
            })
        }

        fn text(&mut self) -> Option<String> {
            self.clipboard.get_text().ok()
        }

        fn restore(&mut self) -> Result<(), CaptureError> {
            let Some(snapshot) = self.snapshot.take() else {
                return Ok(());
            };
            let result = match snapshot {
                ClipboardSnapshot::Text(text) => self.clipboard.set_text(text),
                ClipboardSnapshot::Image {
                    width,
                    height,
                    bytes,
                } => self.clipboard.set_image(ImageData {
                    width,
                    height,
                    bytes: Cow::Owned(bytes),
                }),
                ClipboardSnapshot::Empty => self.clipboard.clear(),
            };
            result.map_err(|error| {
                CaptureError::CaptureFailed(format!("无法恢复原剪贴板内容：{error}"))
            })
        }
    }

    impl Drop for ClipboardSession {
        fn drop(&mut self) {
            let _ = self.restore();
        }
    }

    pub fn capture_selected_text() -> Result<String, CaptureError> {
        // SAFETY: AXIsProcessTrusted takes no pointers and only queries the TCC state
        // for the current process.
        if !unsafe { AXIsProcessTrusted() } {
            return Err(CaptureError::PermissionDenied);
        }

        if let Ok(text) = selected_text_by_accessibility() {
            let text = text.trim().to_string();
            if !text.is_empty() {
                return Ok(text);
            }
        }

        selected_text_by_clipboard()
    }

    fn selected_text_by_accessibility() -> Result<String, CaptureError> {
        let system_element = AXUIElement::system_wide();
        let selected_element = system_element
            .attribute(&AXAttribute::new(&CFString::from_static_string(
                kAXFocusedUIElementAttribute,
            )))
            .ok()
            .and_then(|element| element.downcast_into::<AXUIElement>())
            .ok_or_else(|| {
                CaptureError::CaptureFailed("当前应用没有可读取的焦点元素".to_string())
            })?;
        selected_element
            .attribute(&AXAttribute::new(&CFString::from_static_string(
                kAXSelectedTextAttribute,
            )))
            .ok()
            .and_then(|text| text.downcast_into::<CFString>())
            .map(|text| text.to_string())
            .ok_or_else(|| CaptureError::CaptureFailed("当前焦点元素不提供系统选区".to_string()))
    }

    fn selected_text_by_clipboard() -> Result<String, CaptureError> {
        let mut session = ClipboardSession::new()?;
        let sentinel = format!(
            "__READFLOW_SELECTION_{}_{}__",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        );
        session.set_text(&sentinel)?;
        send_copy_shortcut()?;

        let mut captured = None;
        for _ in 0..COPY_ATTEMPTS {
            thread::sleep(COPY_POLL_INTERVAL);
            if let Some(text) = classify_clipboard_text(&sentinel, session.text().as_deref()) {
                captured = Some(text);
                break;
            }
        }

        finalize_clipboard_capture(captured, || session.restore())
    }

    fn send_copy_shortcut() -> Result<(), CaptureError> {
        let mut enigo = Enigo::new(&Settings::default()).map_err(|error| {
            CaptureError::CaptureFailed(format!("无法初始化键盘复制操作：{error}"))
        })?;
        enigo.key(Key::Meta, Press).map_err(|error| {
            CaptureError::CaptureFailed(format!("无法按下 Command 键：{error}"))
        })?;
        let copy_result = enigo.key(Key::Unicode('c'), Click);
        let release_result = enigo.key(Key::Meta, Release);
        copy_result
            .map_err(|error| CaptureError::CaptureFailed(format!("无法发送 Command+C：{error}")))?;
        release_result
            .map_err(|error| CaptureError::CaptureFailed(format!("无法释放 Command 键：{error}")))
    }
}

fn classify_clipboard_text(sentinel: &str, text: Option<&str>) -> Option<String> {
    let text = text?.trim();
    (!text.is_empty() && text != sentinel).then(|| text.to_string())
}

fn finalize_clipboard_capture(
    captured: Option<String>,
    restore: impl FnOnce() -> Result<(), CaptureError>,
) -> Result<String, CaptureError> {
    restore()?;
    captured.ok_or(CaptureError::NoSelection)
}

#[cfg(target_os = "macos")]
pub use platform::capture_selected_text;

#[cfg(not(target_os = "macos"))]
pub fn capture_selected_text() -> Result<String, CaptureError> {
    Err(CaptureError::NoSelection)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copied_text_is_only_accepted_after_clipboard_changes() {
        assert_eq!(
            classify_clipboard_text("readflow-sentinel", Some("Selected text")),
            Some("Selected text".to_string())
        );
        assert_eq!(
            classify_clipboard_text("readflow-sentinel", Some("readflow-sentinel")),
            None
        );
    }

    #[test]
    fn empty_or_whitespace_clipboard_is_not_a_selection() {
        assert_eq!(
            classify_clipboard_text("readflow-sentinel", Some("  \n")),
            None
        );
        assert_eq!(classify_clipboard_text("readflow-sentinel", None), None);
    }

    #[test]
    fn permission_error_explains_how_to_reauthorize_the_installed_app() {
        let message = CaptureError::PermissionDenied.user_message();
        assert!(message.contains("删除旧的 ReadFlow 条目"));
        assert!(message.contains("/Applications/ReadFlow.app"));
        assert!(message.contains("重启应用"));
    }

    #[test]
    fn clipboard_is_restored_before_success_or_no_selection_is_returned() {
        use std::cell::Cell;

        for captured in [Some("Selected text".to_string()), None] {
            let restored = Cell::new(false);
            let result = finalize_clipboard_capture(captured.clone(), || {
                restored.set(true);
                Ok(())
            });
            assert!(restored.get());
            assert_eq!(result, captured.ok_or(CaptureError::NoSelection));
        }
    }

    #[test]
    fn clipboard_restore_failure_is_not_hidden_by_a_capture_result() {
        let result = finalize_clipboard_capture(Some("Selected text".to_string()), || {
            Err(CaptureError::CaptureFailed("restore failed".to_string()))
        });
        assert_eq!(
            result,
            Err(CaptureError::CaptureFailed("restore failed".to_string()))
        );
    }
}
