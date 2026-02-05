import os
import requests
import json
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# 阿里云模型配置
ALIYUN_ACCESS_KEY = os.getenv("ALIYUN_ACCESS_KEY", "your_aliyun_access_key")
ALIYUN_ACCESS_KEY_SECRET = os.getenv("ALIYUN_ACCESS_KEY_SECRET", "your_aliyun_access_key_secret")
ALIYUN_REGION_ID = os.getenv("ALIYUN_REGION_ID", "cn-beijing")
ALIYUN_MODEL_NAME = os.getenv("ALIYUN_MODEL_NAME", "qwen-max")
ALIYUN_API_VERSION = os.getenv("ALIYUN_API_VERSION", "2024-07-01")

# 生成阿里云 API 签名
# 注意：实际生产环境中需要实现完整的阿里云 API 签名算法
# 为了简化示例，这里使用 Bearer Token 方式，实际使用时需要替换为正确的签名方式
def generate_aliyun_signature():
    """生成阿里云 API 签名"""
    return ALIYUN_ACCESS_KEY

# 调用阿里云模型
def call_aliyun_model(prompt, model_name=None, temperature=0.7, max_tokens=1000):
    """调用阿里云模型并返回响应"""
    try:
        # 使用指定的模型名称或默认模型
        model = model_name or ALIYUN_MODEL_NAME
        
        # 构建 API URL
        api_url = f"https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation"
        
        # 构建请求头
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {ALIYUN_ACCESS_KEY}"
        }
        
        # 构建请求体
        payload = {
            "model": model,
            "input": {
                "prompt": prompt
            },
            "parameters": {
                "temperature": temperature,
                "max_tokens": max_tokens
            }
        }
        
        # 发送请求
        response = requests.post(api_url, headers=headers, data=json.dumps(payload))
        
        if response.status_code == 200:
            result = response.json()
            return result
        else:
            print(f"阿里云模型调用失败: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"调用阿里云模型时出错: {e}")
        return None

# 调用阿里云图像生成模型
def call_aliyun_image_model(prompt, size="1024x1024", model_name=None):
    """调用阿里云图像生成模型并返回响应"""
    try:
        # 使用指定的模型名称或默认模型
        model = model_name or "stable-diffusion-xl"
        
        # 构建 API URL
        api_url = f"https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation"
        
        # 构建请求头
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {ALIYUN_ACCESS_KEY}"
        }
        
        # 构建请求体
        payload = {
            "model": model,
            "input": {
                "prompt": prompt
            },
            "parameters": {
                "size": size
            }
        }
        
        # 发送请求
        response = requests.post(api_url, headers=headers, data=json.dumps(payload))
        
        if response.status_code == 200:
            result = response.json()
            return result
        else:
            print(f"阿里云图像模型调用失败: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"调用阿里云图像模型时出错: {e}")
        return None
