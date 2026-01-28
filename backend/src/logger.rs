use std::fs::{self, OpenOptions};
use std::io::Write;
use chrono::Local;
use std::path::Path;

/// 统一的日志记录函数，所有日志写入同一个按日期命名的文件
fn write_log(log_type: &str, content: &str) -> std::io::Result<()> {
    let log_dir = "logs";
    if !Path::new(log_dir).exists() {
        fs::create_dir_all(log_dir)?;
    }

    // 按日期创建日志文件：logs/YYYY-MM-DD.log
    let date = Local::now().format("%Y-%m-%d");
    let filename = format!("{}/{}.log", log_dir, date);
    
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(filename)?;

    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S");
    writeln!(file, "[{}] [{}] {}", timestamp, log_type, content)?;
    writeln!(file, "{}", "=".repeat(80))?;

    Ok(())
}

pub fn log_model_interaction(model_name: &str, request: &str, response: &str) -> std::io::Result<()> {
    let content = format!(
        "Model: {}\n--- Request ---\n{}\n--- Response ---\n{}",
        model_name, request, response
    );
    write_log("MODEL", &content)
}
