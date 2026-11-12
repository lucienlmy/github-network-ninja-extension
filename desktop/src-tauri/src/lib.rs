use serde_json::Value;

#[tauri::command]
async fn fetch_github_json(url: String) -> Result<Value, String> {
    if !(url.starts_with("https://github.com/") || url.starts_with("https://api.github.com/"))
    {
        return Err("仅允许请求 github.com".into());
    }

    let client = reqwest::Client::builder()
        .user_agent("GitHub-Network-Ninja-Desktop/0.1")
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .get(&url)
        .header("Accept", "application/json")
        .header("X-Requested-With", "XMLHttpRequest")
        .send()
        .await
        .map_err(|e| format!("网络错误: {e}"))?;

    let status = res.status();
    let text = res.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("HTTP {} {}", status.as_u16(), text.chars().take(200).collect::<String>()));
    }

    serde_json::from_str(&text).map_err(|e| format!("JSON 解析失败: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![fetch_github_json])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
