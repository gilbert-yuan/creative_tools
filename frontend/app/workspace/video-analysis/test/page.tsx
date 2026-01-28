'use client'

import { useState } from 'react'
import {
  Box,
  Container,
  Heading,
  Text,
  Stack,
  Button,
  VStack,
  Code,
  Badge,
} from '@chakra-ui/react'
import { videoService } from '@/lib/api'
import MainLayout from '@/components/MainLayout'

export default function TestPage() {
  const [testing, setTesting] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string>('')

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`])
    console.log(message)
  }

  const testAPI = async () => {
    setTesting(true)
    setLogs([])
    setResult(null)
    setError('')

    try {
      addLog('开始测试...')

      // 创建一个小的测试视频文件
      addLog('创建测试文件...')
      const testBlob = new Blob(['test'], { type: 'video/mp4' })
      const testFile = new File([testBlob], 'test.mp4', { type: 'video/mp4' })

      addLog(`文件大小: ${testFile.size} bytes`)
      addLog(`文件类型: ${testFile.type}`)

      addLog('调用 API...')
      const startTime = Date.now()

      const response = await videoService.virtualCut(testFile)

      const endTime = Date.now()
      const duration = ((endTime - startTime) / 1000).toFixed(2)

      addLog(`API 响应成功！耗时: ${duration}秒`)
      addLog(`检测到 ${response.total_scenes} 个场景`)

      setResult(response)

    } catch (err: any) {
      const errorMsg = err.message || String(err)
      addLog(`❌ 错误: ${errorMsg}`)
      setError(errorMsg)
      console.error('测试失败:', err)
    } finally {
      setTesting(false)
    }
  }

  const testWithRealVideo = async () => {
    setTesting(true)
    setLogs([])
    setResult(null)
    setError('')

    try {
      addLog('开始测试真实视频...')

      // 从 public 目录获取视频
      addLog('获取测试视频: /a.mp4')
      const response = await fetch('/a.mp4')

      if (!response.ok) {
        throw new Error(`获取视频失败: ${response.status}`)
      }

      const blob = await response.blob()
      addLog(`视频大小: ${(blob.size / 1024 / 1024).toFixed(2)} MB`)

      const file = new File([blob], 'test_video.mp4', { type: 'video/mp4' })

      addLog('调用后端 API...')
      const startTime = Date.now()

      const result = await videoService.virtualCut(file)

      const endTime = Date.now()
      const duration = ((endTime - startTime) / 1000).toFixed(2)

      addLog(`✅ API 响应成功！耗时: ${duration}秒`)
      addLog(`检测到 ${result.total_scenes} 个场景`)
      addLog(`视频时长: ${result.video_info.duration.toFixed(2)}秒`)
      addLog(`视频分辨率: ${result.video_info.width}x${result.video_info.height}`)

      setResult(result)

    } catch (err: any) {
      const errorMsg = err.message || String(err)
      addLog(`❌ 错误: ${errorMsg}`)
      setError(errorMsg)
      console.error('测试失败:', err)
    } finally {
      setTesting(false)
    }
  }

  return (
    <MainLayout>
      <Container maxW="6xl" py={8}>
        <Stack gap={6}>
          <Box>
            <Heading size="lg" color="white" mb={2}>
              API 测试工具
            </Heading>
            <Text color="gray.400" fontSize="sm">
              测试视频虚拟剪辑 API 的响应速度和功能
            </Text>
          </Box>

          <Box bg="gray.900" border="1px" borderColor="gray.800" borderRadius="lg" p={6}>
            <VStack gap={4}>
              <Button
                w="full"
                onClick={testWithRealVideo}
                disabled={testing}
                bg="cyan.500"
                color="white"
                _hover={{ bg: 'cyan.600' }}
              >
                {testing ? '测试中...' : '测试真实视频 (a.mp4)'}
              </Button>

              <Button
                w="full"
                onClick={testAPI}
                disabled={testing}
                variant="outline"
                borderColor="gray.700"
                color="gray.300"
                _hover={{ bg: 'gray.800' }}
              >
                {testing ? '测试中...' : '快速测试 (模拟文件)'}
              </Button>
            </VStack>
          </Box>

          {logs.length > 0 && (
            <Box bg="gray.900" border="1px" borderColor="gray.800" borderRadius="lg" p={6}>
              <Heading size="sm" color="white" mb={4}>
                执行日志
              </Heading>
              <VStack align="stretch" gap={2}>
                {logs.map((log, idx) => (
                  <Text key={idx} fontFamily="mono" fontSize="sm" color="gray.300">
                    {log}
                  </Text>
                ))}
              </VStack>
            </Box>
          )}

          {error && (
            <Box bg="red.900" border="1px" borderColor="red.700" borderRadius="lg" p={4}>
              <Badge bg="red.500" color="white" mb={2}>错误</Badge>
              <Text color="red.200" fontFamily="mono" fontSize="sm">
                {error}
              </Text>
            </Box>
          )}

          {result && (
            <Box bg="gray.900" border="1px" borderColor="gray.800" borderRadius="lg" p={6}>
              <Heading size="sm" color="white" mb={4}>
                API 响应结果
              </Heading>
              <Code
                display="block"
                whiteSpace="pre"
                p={4}
                bg="gray.950"
                color="green.300"
                borderRadius="md"
                fontSize="xs"
                overflow="auto"
                maxH="400px"
              >
                {JSON.stringify(result, null, 2)}
              </Code>
            </Box>
          )}
        </Stack>
      </Container>
    </MainLayout>
  )
}
