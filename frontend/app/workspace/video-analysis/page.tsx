'use client'

import { useState, useEffect } from 'react'
import {
  Box,
  Container,
  Heading,
  Text,
  Stack,
  Button,
  SimpleGrid,
  Image,
  VStack,
  HStack,
  Badge,
  Flex,
  Icon,
} from '@chakra-ui/react'
import { Upload, Film, Clock, History, FileVideo, Trash2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import MainLayout from '@/components/MainLayout'
import { videoService, JobItem } from '@/lib/api'
import './progress.css'

interface Scene {
  index: number
  startTime: number
  endTime: number
  duration: number
  mergedImageUrl: string
  frameCount: number
  analysis?: string
}

export default function VideoAnalysisPage() {
  const [inputMode, setInputMode] = useState<'upload' | 'youtube'>('upload')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [scenes, setScenes] = useState<Scene[]>([])
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [successMessage, setSuccessMessage] = useState<string>('')
  const [isDragging, setIsDragging] = useState(false)
  const [estimatedTime, setEstimatedTime] = useState<number>(0)
  const [historyJobs, setHistoryJobs] = useState<JobItem[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const router = useRouter()

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    setLoadingHistory(true)
    try {
      const jobs = await videoService.getJobs(20, 0)
      setHistoryJobs(jobs)
    } catch (error) {
      console.error('加载历史记录失败:', error)
    } finally {
      setLoadingHistory(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    setErrorMessage('')
    setSuccessMessage('')
    if (file && file.type.startsWith('video/')) {
      // 检查文件大小是否超过100MB
      const maxSize = 100 * 1024 * 1024 // 100MB
      if (file.size > maxSize) {
        setErrorMessage('视频文件大小不能超过 100MB，当前文件大小: ' + (file.size / (1024 * 1024)).toFixed(2) + ' MB')
        return
      }

      setSelectedFile(file)
      setScenes([])

      // 预估处理时长（假设每MB需要2秒）
      const fileSizeMB = file.size / (1024 * 1024)
      const estimated = Math.ceil(fileSizeMB * 2)
      setEstimatedTime(estimated)
    } else {
      setErrorMessage('请选择视频文件')
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    setErrorMessage('')
    setSuccessMessage('')

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      const file = files[0]
      if (file.type.startsWith('video/')) {
        // 检查文件大小是否超过100MB
        const maxSize = 100 * 1024 * 1024 // 100MB
        if (file.size > maxSize) {
          setErrorMessage('视频文件大小不能超过 100MB，当前文件大小: ' + (file.size / (1024 * 1024)).toFixed(2) + ' MB')
          return
        }

        setSelectedFile(file)
        setScenes([])

        // 预估处理时长
        const fileSizeMB = file.size / (1024 * 1024)
        const estimated = Math.ceil(fileSizeMB * 2)
        setEstimatedTime(estimated)
      } else {
        setErrorMessage('请拖拽视频文件')
      }
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    setUploading(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      // 直接在这里上传，不跳转
      console.log('[Upload] 开始上传分析...')
      console.log('[Upload] 文件信息:', {
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type
      })

      const result = await videoService.virtualCut(selectedFile)

      console.log('[Upload] 分析完成，结果:', {
        total_scenes: result.total_scenes,
        video_url: result.video_url,
        job_id: result.job_id
      })

      console.log('[Upload] 准备跳转到结果页面, job_id:', result.job_id)

      // 跳转到结果页面，带上 job_id
      router.push(`/workspace/video-analysis/edit?job_id=${result.job_id}`)

      // 刷新历史记录
      loadHistory()
    } catch (error: any) {
      console.error('[Upload] 上传失败:', error)
      console.error('[Upload] 错误详情:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      })

      let errorMsg = '上传分析失败: '
      if (error.message.includes('Failed to fetch')) {
        errorMsg += '无法连接到后端服务，请确认后端已启动（http://localhost:3001）'
      } else {
        errorMsg += error.message || '未知错误'
      }

      setErrorMessage(errorMsg)
      setUploading(false)
    }
  }

  const validateYouTubeUrl = (url: string): boolean => {
    const patterns = [
      /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
      /^https?:\/\/youtu\.be\/[\w-]+/,
      /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]+/
    ];
    return patterns.some(pattern => pattern.test(url));
  }

  const handleYouTubeDownload = async () => {
    if (!validateYouTubeUrl(youtubeUrl)) {
      setErrorMessage('请输入有效的 YouTube 链接（支持 youtube.com/watch、youtu.be 或 shorts）')
      return
    }

    setDownloading(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      console.log('[YouTube] 开始下载 URL:', youtubeUrl)
      const result = await videoService.youtubeVirtualCut(youtubeUrl)

      console.log('[YouTube] 下载成功，跳转到结果页面, job_id:', result.job_id)
      router.push(`/workspace/video-analysis/edit?job_id=${result.job_id}`)

      // 刷新历史记录
      loadHistory()
    } catch (error: any) {
      console.error('[YouTube] 下载失败:', error)

      let errorMsg = 'YouTube 视频下载失败: '
      if (error.message.includes('Failed to fetch')) {
        errorMsg += '无法连接到后端服务，请确认后端已启动（http://localhost:3001）'
      } else {
        errorMsg += error.message || '未知错误'
      }

      setErrorMessage(errorMsg)
      setDownloading(false)
    }
  }

  return (
    <MainLayout>
      <Container maxW="7xl" py={8}>
        <Stack gap={6}>
          {errorMessage && (
            <Box
              bg="red.900"
              border="1px"
              borderColor="red.700"
              borderRadius="lg"
              p={4}
            >
              <Text color="red.200">{errorMessage}</Text>
            </Box>
          )}
          {successMessage && (
            <Box
              bg="green.900"
              border="1px"
              borderColor="green.700"
              borderRadius="lg"
              p={4}
            >
              <Text color="green.200">{successMessage}</Text>
            </Box>
          )}

          <Box>
            <Heading size="lg" color="white" mb={2}>
              视频分镜
            </Heading>
            <Text color="gray.400" fontSize="sm">
              上传视频，自动生成分镜，可手工调整
            </Text>
          </Box>

          <Box
            bg="whiteAlpha.50"
            backdropFilter="blur(10px)"
            borderColor="whiteAlpha.100"
            border="1px"
            borderRadius="lg"
            p={6}
          >
            <VStack gap={4}>
              {/* 模式切换 */}
              <HStack w="full" gap={2} mb={2}>
                <Button
                  flex={1}
                  onClick={() => setInputMode('upload')}
                  bg={inputMode === 'upload' ? 'cyan.500' : 'whiteAlpha.200'}
                  color="white"
                  _hover={{ bg: inputMode === 'upload' ? 'cyan.600' : 'whiteAlpha.300' }}
                  borderRadius="md"
                >
                  📁 本地上传
                </Button>
                <Button
                  flex={1}
                  onClick={() => setInputMode('youtube')}
                  bg={inputMode === 'youtube' ? 'cyan.500' : 'whiteAlpha.200'}
                  color="white"
                  _hover={{ bg: inputMode === 'youtube' ? 'cyan.600' : 'whiteAlpha.300' }}
                  borderRadius="md"
                >
                  🎬 YouTube 链接
                </Button>
              </HStack>

              {/* 文件上传模式 */}
              {inputMode === 'upload' && (
                <>
                  <Box
                    as="label"
                    w="full"
                    border="2px dashed"
                    borderColor={isDragging ? 'cyan.500' : selectedFile ? 'cyan.600' : 'whiteAlpha.200'}
                    bg={isDragging ? 'rgba(6, 182, 212, 0.1)' : selectedFile ? 'rgba(6, 182, 212, 0.05)' : 'transparent'}
                    borderRadius="lg"
                    p={8}
                    textAlign="center"
                    _hover={{ borderColor: 'cyan.500', cursor: 'pointer' }}
                    transition="all 0.2s"
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    suppressHydrationWarning
                  >
                    <input
                      type="file"
                      accept="video/*"
                      onChange={handleFileSelect}
                      style={{ display: 'none' }}
                    />
                    <VStack gap={3}>
                      <Icon as={Upload} boxSize={12} color={isDragging ? 'cyan.500' : selectedFile ? 'cyan.400' : 'gray.500'} />
                      {isDragging ? (
                        <Text color="cyan.500" fontWeight="bold">
                          松开鼠标上传视频
                        </Text>
                      ) : selectedFile ? (
                        <VStack gap={2}>
                          <Text color="cyan.400" fontWeight="bold" fontSize="lg">
                            {selectedFile.name}
                          </Text>
                          <HStack color="gray.400" fontSize="sm">
                            <Badge bg="cyan.500" color="white">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</Badge>
                            <Text>•</Text>
                            <HStack>
                              <Clock size={14} />
                              <Text>预计 ~{estimatedTime}秒</Text>
                            </HStack>
                          </HStack>
                          <Text color="gray.500" fontSize="sm" mt={2}>
                            点击可重新选择视频
                          </Text>
                        </VStack>
                      ) : (
                        <>
                          <Text color="gray.300" fontWeight="semibold" fontSize="lg">
                            点击选择视频文件
                          </Text>
                          <Text color="gray.500" fontSize="sm">
                            或拖拽视频文件到此处
                          </Text>
                          <Text color="gray.600" fontSize="xs" mt={2}>
                            支持 MP4, MOV, AVI 等常见格式，最大 100MB
                          </Text>
                        </>
                      )}
                    </VStack>
                  </Box>

                  {selectedFile && !uploading && (
                    <Button
                      size="lg"
                      w="full"
                      onClick={handleUpload}
                      bg="cyan.500"
                      color="white"
                      _hover={{ bg: 'cyan.600' }}
                      _active={{ bg: 'cyan.700' }}
                      fontWeight="medium"
                      borderRadius="md"
                    >
                      开始分析
                    </Button>
                  )}

                  {uploading && (
                    <VStack w="full" gap={4}>
                      <LoadingDots />
                      <Text fontSize="sm" color="gray.400">
                        正在上传并分析视频，请稍候...
                      </Text>
                      <Text fontSize="xs" color="gray.500">
                        大文件可能需要几分钟，请勿关闭页面
                      </Text>
                    </VStack>
                  )}
                </>
              )}

              {/* YouTube 模式 */}
              {inputMode === 'youtube' && (
                <>
                  <VStack w="full" gap={4}>
                    <Box w="full">
                      <input
                        type="text"
                        value={youtubeUrl}
                        onChange={(e) => setYoutubeUrl(e.target.value)}
                        placeholder="输入 YouTube 链接 (例如: https://www.youtube.com/watch?v=xxx)"
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          borderRadius: '8px',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          backgroundColor: 'rgba(255, 255, 255, 0.1)',
                          color: '#f3f4f6',
                          fontSize: '14px',
                          outline: 'none',
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = '#06b6d4';
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                        }}
                      />
                      <Text fontSize="xs" color="gray.500" mt={2}>
                        支持 youtube.com/watch、youtu.be 或 youtube.com/shorts 链接
                      </Text>
                    </Box>

                    {!downloading && youtubeUrl && (
                      <Button
                        size="lg"
                        w="full"
                        onClick={handleYouTubeDownload}
                        bg="cyan.500"
                        color="white"
                        _hover={{ bg: 'cyan.600' }}
                        _active={{ bg: 'cyan.700' }}
                        fontWeight="medium"
                        borderRadius="md"
                      >
                        开始下载并分析
                      </Button>
                    )}

                    {downloading && (
                      <VStack w="full" gap={4}>
                        <LoadingDots />
                        <Text fontSize="sm" color="gray.400">
                          正在下载 YouTube 视频并分析，请稍候...
                        </Text>
                        <Text fontSize="xs" color="gray.500">
                          下载时间取决于视频大小和网络速度
                        </Text>
                      </VStack>
                    )}
                  </VStack>
                </>
              )}
            </VStack>
          </Box>

          {/* 历史记录部分 */}
          <Box>
            <HStack mb={4} justify="space-between" align="center">
              <HStack>
                <Icon as={History} boxSize={5} color="gray.400" />
                <Heading size="md" color="white">
                  处理历史
                </Heading>
              </HStack>
              <Button
                size="sm"
                onClick={loadHistory}
                disabled={loadingHistory}
                variant="ghost"
                color="gray.400"
                _hover={{ color: 'cyan.400' }}
              >
                {loadingHistory ? '加载中...' : '刷新'}
              </Button>
            </HStack>

            {loadingHistory ? (
              <Box textAlign="center" py={8}>
                <Text color="gray.500">加载中...</Text>
              </Box>
            ) : historyJobs.length === 0 ? (
              <Box
                bg="whiteAlpha.50"
                backdropFilter="blur(10px)"
                border="1px"
                borderColor="whiteAlpha.100"
                borderRadius="lg"
                p={8}
                textAlign="center"
              >
                <Icon as={FileVideo} boxSize={12} color="gray.600" mx="auto" mb={3} />
                <Text color="gray.500">暂无处理记录</Text>
              </Box>
            ) : (
              <Stack gap={3}>
                {historyJobs.map((job) => (
                  <Box
                    key={job.id}
                    bg="whiteAlpha.50"
                    backdropFilter="blur(10px)"
                    border="1px"
                    borderColor="whiteAlpha.100"
                    borderRadius="lg"
                    p={4}
                    _hover={{ borderColor: 'cyan.500', cursor: 'pointer', bg: 'whiteAlpha.100' }}
                    transition="all 0.2s"
                    onClick={() => router.push(`/workspace/video-analysis/edit?job_id=${job.id}`)}
                  >
                    <HStack justify="space-between" align="start">
                      <HStack gap={3} flex={1}>
                        <Icon as={FileVideo} boxSize={5} color="cyan.400" flexShrink={0} />
                        <VStack align="start" gap={1} flex={1}>
                          <Text color="white" fontWeight="medium" fontSize="sm">
                            {job.original_filename}
                          </Text>
                          <HStack fontSize="xs" color="gray.500" flexWrap="wrap">
                            <Text>
                              {(job.file_size_bytes / (1024 * 1024)).toFixed(2)} MB
                            </Text>
                            {job.duration_seconds && (
                              <>
                                <Text>•</Text>
                                <HStack>
                                  <Clock size={12} />
                                  <Text>{job.duration_seconds.toFixed(1)}s</Text>
                                </HStack>
                              </>
                            )}
                            <Text>•</Text>
                            <Text>{new Date(job.created_at).toLocaleString('zh-CN')}</Text>
                          </HStack>
                        </VStack>
                      </HStack>
                      <HStack gap={2} flexShrink={0}>
                        <Badge
                          bg={job.status === 'completed' ? 'green.500' : job.status === 'processing' ? 'blue.500' : 'red.500'}
                          color="white"
                          fontSize="xs"
                          px={2}
                          py={1}
                          borderRadius="md"
                        >
                          {job.status === 'completed' ? '已完成' : job.status === 'processing' ? '处理中' : '失败'}
                        </Badge>
                        <Button
                          size="xs"
                          variant="ghost"
                          color="gray.500"
                          _hover={{ color: 'red.400', bg: 'whiteAlpha.100' }}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (confirm('确定要删除这条记录吗？')) {
                              videoService.deleteJob(job.id)
                                .then(() => {
                                  loadHistory()
                                })
                                .catch((err) => {
                                  console.error('删除失败:', err)
                                  setErrorMessage('删除失败: ' + err.message)
                                })
                            }
                          }}
                        >
                          <Icon as={Trash2} boxSize={4} />
                        </Button>
                      </HStack>
                    </HStack>
                  </Box>
                ))}
              </Stack>
            )}
          </Box>

          {scenes.length > 0 && (
            <Box>
              <Heading size="md" color="white" mb={4}>
                分镜结果 ({scenes.length} 个场景)
              </Heading>
              <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={4}>
                {scenes.map((scene) => (
                  <Box
                    key={scene.index}
                    bg="whiteAlpha.50"
                    backdropFilter="blur(10px)"
                    border="1px"
                    borderColor="whiteAlpha.100"
                    borderRadius="lg"
                    overflow="hidden"
                    _hover={{ borderColor: 'brand.500', bg: 'whiteAlpha.100' }}
                    transition="all 0.2s"
                  >
                    <Image
                      src={scene.mergedImageUrl}
                      alt={`场景 ${scene.index}`}
                      objectFit="cover"
                      w="full"
                      h="200px"
                      bg="whiteAlpha.100"
                    />
                    <Box p={4}>
                      <VStack align="start" gap={3}>
                        <HStack>
                          <Badge colorScheme="brand">
                            场景 {scene.index}
                          </Badge>
                          <HStack fontSize="xs" color="gray.500">
                            <Clock size={12} />
                            <Text>
                              {scene.startTime.toFixed(1)}s - {scene.endTime.toFixed(1)}s
                            </Text>
                          </HStack>
                        </HStack>
                        <HStack fontSize="sm" color="gray.400">
                          <Film size={14} />
                          <Text>{scene.frameCount} 帧</Text>
                        </HStack>
                        {scene.analysis && (
                          <Box
                            w="full"
                            p={3}
                            bg="whiteAlpha.100"
                            borderRadius="md"
                            fontSize="sm"
                          >
                            <Text color="gray.300" lineClamp={4}>
                              {scene.analysis}
                            </Text>
                          </Box>
                        )}
                      </VStack>
                    </Box>
                  </Box>
                ))}
              </SimpleGrid>
            </Box>
          )}
        </Stack>
      </Container>
    </MainLayout>
  )
}

// 加载动画组件
function LoadingDots() {
  const dotVariants = {
    pulse: {
      scale: [1, 1.5, 1],
      transition: {
        duration: 1.2,
        repeat: Infinity,
        ease: 'easeInOut' as const,
      },
    },
  }

  return (
    <motion.div
      animate="pulse"
      transition={{ staggerChildren: -0.2, staggerDirection: -1 }}
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      <motion.div
        variants={dotVariants}
        style={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          backgroundColor: '#6366f1',
          willChange: 'transform',
        }}
      />
      <motion.div
        variants={dotVariants}
        style={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          backgroundColor: '#6366f1',
          willChange: 'transform',
        }}
      />
      <motion.div
        variants={dotVariants}
        style={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          backgroundColor: '#6366f1',
          willChange: 'transform',
        }}
      />
    </motion.div>
  )
}
