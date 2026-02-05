from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import SQLAlchemyError
import os
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# 获取数据库连接字符串
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/video_analysis")

# 创建数据库引擎
engine = create_engine(DATABASE_URL)

# 创建会话工厂
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 依赖项，用于获取数据库会话
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# 初始化数据库
def init_db():
    try:
        # 导入所有模型，确保它们被注册
        from .models import Base
        
        # 创建所有表
        Base.metadata.create_all(bind=engine)
        print("数据库初始化成功")
    except SQLAlchemyError as e:
        print(f"数据库初始化失败: {e}")
        raise

if __name__ == "__main__":
    init_db()
