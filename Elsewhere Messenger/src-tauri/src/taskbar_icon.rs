use std::ffi::c_void;
use std::sync::OnceLock;
use tauri::WebviewWindow;

#[link(name = "user32")]
unsafe extern "system" {
    fn CreateIconFromResourceEx(
        bits: *const u8, size: u32, icon: i32, version: u32, width: i32, height: i32, flags: u32,
    ) -> *mut c_void;
    fn SendMessageW(window: *mut c_void, message: u32, wparam: usize, lparam: isize) -> isize;
}

const WM_SETICON: u32 = 0x0080;
const ICON_SMALL: usize = 0;
const ICON_BIG: usize = 1;
const ICON_DATA: &[u8] = include_bytes!("../icons/taskbar-icon.dib");

// Each window borrows this icon for as long as it is open. Windows frees
// the process-owned handle when Elsewhere exits.
static APP_ICON: OnceLock<usize> = OnceLock::new();

fn app_icon() -> usize {
    *APP_ICON.get_or_init(|| {
        // The Win32 API requires DWORD alignment for its DIB buffer.
        let mut aligned = vec![0u32; ICON_DATA.len().div_ceil(4)];
        for (word, bytes) in aligned.iter_mut().zip(ICON_DATA.chunks(4)) {
            let mut padded = [0; 4];
            padded[..bytes.len()].copy_from_slice(bytes);
            *word = u32::from_le_bytes(padded);
        }
        unsafe {
            CreateIconFromResourceEx(aligned.as_ptr().cast(), ICON_DATA.len() as u32, 1, 0x0003_0000, 64, 64, 0) as usize
        }
    })
}

pub fn apply(window: &WebviewWindow) -> Result<(), String> {
    let icon = app_icon();
    if icon == 0 { return Err("Could not load the Elsewhere butterfly as a Windows icon.".into()); }
    let webview = window.clone();
    window.run_on_main_thread(move || {
        match webview.hwnd() {
            Ok(hwnd) => unsafe {
                SendMessageW(hwnd.0 as *mut c_void, WM_SETICON, ICON_SMALL, icon as isize);
                SendMessageW(hwnd.0 as *mut c_void, WM_SETICON, ICON_BIG, icon as isize);
            },
            Err(error) => log::warn!("Could not get the Elsewhere window handle: {error}"),
        }
    }).map_err(|error| error.to_string())
}
