import logging
import os
from datetime import datetime
from pathlib import Path

# 确保日志目录存在
log_dir = Path("logs")
log_dir.mkdir(exist_ok=True)

# 生成日志文件名
log_filename = log_dir / f"app_{datetime.now().strftime('%Y-%m-%d')}.log"

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler(log_filename),
        logging.StreamHandler()
    ]
)

# 创建日志记录器
def setup_logger(name="app"):
    """创建并返回一个日志记录器"""
    logger = logging.getLogger(name)
    return logger

# 示例使用
if __name__ == "__main__":
    logger = setup_logger()
    logger.info("测试日志记录")
    logger.error("测试错误日志")
