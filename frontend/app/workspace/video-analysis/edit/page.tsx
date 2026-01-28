'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import {
    Box,
    Container,
    Text,
    Stack,
    Button,
    HStack,
    VStack,
    Link,
    Grid,
} from '@chakra-ui/react'
import { Play, Pause, Plus, Trash2, ChevronLeft } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import NextLink from 'next/link'
import MainLayout from '@/components/MainLayout'
import { videoService, type VirtualCutResponse } from '@/lib/api'

interface Scene {
    index: number
    startTime: number
    endTime: number
    duration: number
    startTimestamp: string
    endTimestamp: string
}

function VideoEditContent() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const [scenes, setScenes] = useState<Scene[]>([])
    const [videoUrl, setVideoUrl] = useState<string>('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string>('')
    const [currentSceneIndex, setCurrentSceneIndex] = useState(0)
    const [currentTime, setCurrentTime] = useState(0)
    const [isPlaying, setIsPlaying] = useState(false)
    const [videoDuration, setVideoDuration] = useState(0)
    const [copied, setCopied] = useState(false)
    const [saving, setSaving] = useState(false)
    const [saveSuccess, setSaveSuccess] = useState(false)
    const [jobId, setJobId] = useState<string>('')
    const [videoFps, setVideoFps] = useState(30) // 默认30fps，从视频元数据获取
    const [youtubeUrl, setYoutubeUrl] = useState<string>('')
    const [originalFilename, setOriginalFilename] = useState<string>('')

    const videoRef = useRef<HTMLVideoElement>(null)
    const prevFrameRef = useRef<HTMLVideoElement>(null)
    const currentFrameRef = useRef<HTMLVideoElement>(null)
    const nextFrameRef = useRef<HTMLVideoElement>(null)

    useEffect(() => {
        const jobIdParam = searchParams.get('job_id')

        if (!jobIdParam) {
            setError('未找到任务ID')
            setLoading(false)
            return
        }

        setJobId(jobIdParam)

        const loadResult = async () => {
            try {
                const result: VirtualCutResponse = await videoService.getResult(jobIdParam)

                const backendVideoUrl = `http://localhost:3001${result.video_url}`
                setVideoUrl(backendVideoUrl)
                setScenes(result.scenes)
                setYoutubeUrl(result.youtube_url || '')
                setOriginalFilename(result.original_filename)
                setLoading(false)
            } catch (error: any) {
                setError('获取分析结果失败: ' + error.message)
                setLoading(false)
            }
        }

        loadResult()
    }, [searchParams])

    useEffect(() => {
        const video = videoRef.current
        if (!video) return

        const handleLoadedMetadata = () => {
            setVideoDuration(video.duration)

            // 尝试从视频获取真实fps，如果无法获取则使用默认30fps
            // 注意：浏览器不直接提供fps，我们使用合理的默认值
            // 也可以从后端API的video_info获取
            setVideoFps(30) // 可以从result.video_info.fps获取
        }

        const handleTimeUpdate = () => {
            setCurrentTime(video.currentTime)

            // 检查是否到达下一个切点，自动暂停
            if (isPlaying) {
                const nextScene = scenes[currentSceneIndex + 1]
                if (nextScene && video.currentTime >= nextScene.startTime - 0.1) {
                    video.pause()
                    setIsPlaying(false)
                    setCurrentTime(nextScene.startTime)
                    setCurrentSceneIndex(currentSceneIndex + 1)
                }
            }
        }

        video.addEventListener('loadedmetadata', handleLoadedMetadata)
        video.addEventListener('timeupdate', handleTimeUpdate)

        return () => {
            video.removeEventListener('loadedmetadata', handleLoadedMetadata)
            video.removeEventListener('timeupdate', handleTimeUpdate)
        }
    }, [scenes, currentSceneIndex, isPlaying])

    // 同步其他预览视频的时间 - 基于当前播放位置而不是场景起始时间
    useEffect(() => {
        if (scenes.length === 0 || !videoRef.current) return

        const frameTime = 1 / videoFps // 真实的一帧时间
        const actualTime = currentTime // 使用实际播放位置

        // 上一帧：当前播放位置的前一帧
        if (prevFrameRef.current) {
            prevFrameRef.current.currentTime = Math.max(0, actualTime - frameTime)
        }

        // 当前帧：当前播放位置
        if (currentFrameRef.current) {
            currentFrameRef.current.currentTime = actualTime
        }

        // 下一帧：当前播放位置的后一帧
        if (nextFrameRef.current) {
            nextFrameRef.current.currentTime = Math.min(videoDuration, actualTime + frameTime)
        }
    }, [currentTime, scenes, videoFps, videoDuration])

    // 键盘快捷键支持
    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            // 检查是否在输入框中，避免干扰正常输入
            const target = e.target as HTMLElement
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                return
            }

            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault()
                    handlePrevFrame()
                    break
                case 'ArrowRight':
                    e.preventDefault()
                    handleNextFrame()
                    break
            }
        }

        window.addEventListener('keydown', handleKeyPress)
        return () => {
            window.removeEventListener('keydown', handleKeyPress)
        }
    }, [videoFps, videoDuration]) // 依赖这些值，以便在回调中访问最新的 handlePrevFrame 和 handleNextFrame

    const handlePlay = () => {
        const video = videoRef.current
        if (!video) return

        if (isPlaying) {
            video.pause()
            setIsPlaying(false)
        } else {
            video.play()
            setIsPlaying(true)
        }
    }

    const handleReplay = () => {
        const video = videoRef.current
        if (!video || scenes.length === 0) return

        // 根据当前播放位置找到对应的场景，而不是使用 currentSceneIndex
        const currentPlaybackTime = video.currentTime
        let sceneToReplay = scenes[currentSceneIndex]

        // 找到当前播放位置所在的场景
        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i]
            const nextScene = scenes[i + 1]
            const sceneEndTime = nextScene ? nextScene.startTime : videoDuration

            if (currentPlaybackTime >= scene.startTime && currentPlaybackTime < sceneEndTime) {
                sceneToReplay = scene
                setCurrentSceneIndex(i) // 同步更新索引
                break
            }
        }

        // 重播找到的场景
        video.currentTime = sceneToReplay.startTime
        video.play()
        setIsPlaying(true)
    }

    const handlePhysicalSplit = async () => {
        if (!jobId || scenes.length === 0) return

        if (!confirm(`确定要将视频物理切分为 ${scenes.length} 个文件吗？`)) {
            return
        }

        setSaving(true)
        try {
            // 调用物理切分 API
            const response = await videoService.physicalSplit(jobId)
            setSaveSuccess(true)
            setTimeout(() => setSaveSuccess(false), 2000)
        } catch (error: any) {
            console.error('[编辑器] 物理切分失败:', error)
            alert('物理切分失败: ' + error.message)
        } finally {
            setSaving(false)
        }
    }

    const handleCopyInfo = async () => {
        const sceneData = scenes.map((scene) => ({
            index: scene.index,
            duration: parseFloat(scene.duration.toFixed(3)),
            start: formatTime(scene.startTime),
            end: formatTime(scene.endTime),
        }))

        const jsonData = JSON.stringify(sceneData, null, 2)

        try {
            await navigator.clipboard.writeText(jsonData)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            console.error('Failed to copy:', err)
        }
    }

    const handleAddCutPoint = async () => {
        const newScene: Scene = {
            index: scenes.length,
            startTime: currentTime,
            endTime: videoDuration,
            duration: videoDuration - currentTime,
            startTimestamp: formatTime(currentTime),
            endTimestamp: formatTime(videoDuration),
        }

        const newScenes = [...scenes, newScene].sort((a, b) => a.startTime - b.startTime)
        // 重新计算索引和endTime
        const updatedScenes = newScenes.map((scene, idx) => ({
            ...scene,
            index: idx,
            endTime: idx < newScenes.length - 1 ? newScenes[idx + 1].startTime : videoDuration,
            duration: (idx < newScenes.length - 1 ? newScenes[idx + 1].startTime : videoDuration) - scene.startTime,
            endTimestamp: formatTime(idx < newScenes.length - 1 ? newScenes[idx + 1].startTime : videoDuration),
        }))

        setScenes(updatedScenes)

        // 自动保存到数据库
        if (jobId) {
            try {
                const scenesForApi = updatedScenes.map(s => ({
                    ...s,
                    videoUrl: videoUrl,
                    frameCount: 1
                }))
                await videoService.updateScenes(jobId, scenesForApi)
                console.log('[编辑器] 切点已自动保存')
            } catch (error: any) {
                console.error('[编辑器] 自动保存失败:', error)
                alert('保存失败: ' + error.message)
            }
        }
    }

    const handleDeleteCutPoint = async () => {
        if (scenes.length <= 1) {
            alert('至少需要保留一个切点')
            return
        }

        const newScenes = scenes.filter((_, idx) => idx !== currentSceneIndex)
        const updatedScenes = newScenes.map((scene, idx) => ({
            ...scene,
            index: idx,
            endTime: idx < newScenes.length - 1 ? newScenes[idx + 1].startTime : videoDuration,
            duration: (idx < newScenes.length - 1 ? newScenes[idx + 1].startTime : videoDuration) - scene.startTime,
            endTimestamp: formatTime(idx < newScenes.length - 1 ? newScenes[idx + 1].startTime : videoDuration),
        }))

        setScenes(updatedScenes)
        setCurrentSceneIndex(Math.max(0, currentSceneIndex - 1))

        // 自动保存到数据库
        if (jobId) {
            try {
                const scenesForApi = updatedScenes.map(s => ({
                    ...s,
                    videoUrl: videoUrl,
                    frameCount: 1
                }))
                await videoService.updateScenes(jobId, scenesForApi)
                console.log('[编辑器] 切点已自动保存')
            } catch (error: any) {
                console.error('[编辑器] 自动保存失败:', error)
                alert('保存失败: ' + error.message)
            }
        }
    }

    const handleSceneClick = (index: number) => {
        setCurrentSceneIndex(index)
        const video = videoRef.current
        if (video) {
            video.currentTime = scenes[index].startTime
            setCurrentTime(scenes[index].startTime)
        }
    }

    const handlePrevFrame = () => {
        const video = videoRef.current
        if (!video) return

        const frameTime = 1 / videoFps
        const newTime = Math.max(0, video.currentTime - frameTime)
        video.currentTime = newTime
        setCurrentTime(newTime)

        // Update frame previews
        if (prevFrameRef.current) {
            prevFrameRef.current.currentTime = Math.max(0, newTime - frameTime)
        }
        if (currentFrameRef.current) {
            currentFrameRef.current.currentTime = newTime
        }
        if (nextFrameRef.current) {
            nextFrameRef.current.currentTime = newTime + frameTime
        }
    }

    const handleNextFrame = () => {
        const video = videoRef.current
        if (!video) return

        const frameTime = 1 / videoFps
        const newTime = Math.min(videoDuration, video.currentTime + frameTime)
        video.currentTime = newTime
        setCurrentTime(newTime)

        // Update frame previews
        if (prevFrameRef.current) {
            prevFrameRef.current.currentTime = Math.max(0, newTime - frameTime)
        }
        if (currentFrameRef.current) {
            currentFrameRef.current.currentTime = newTime
        }
        if (nextFrameRef.current) {
            nextFrameRef.current.currentTime = Math.min(videoDuration, newTime + frameTime)
        }
    }

    const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const video = videoRef.current
        if (!video) return

        const rect = e.currentTarget.getBoundingClientRect()
        const clickX = e.clientX - rect.left
        const percentage = clickX / rect.width
        const newTime = percentage * videoDuration

        video.currentTime = newTime
        setCurrentTime(newTime)

        const frameTime = 1 / videoFps

        // 等待主视频 seek 完成后再更新预览帧，确保帧同步
        // 使用 requestAnimationFrame 等待浏览器渲染
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                // 更新三个预览帧
                if (prevFrameRef.current) {
                    prevFrameRef.current.currentTime = Math.max(0, newTime - frameTime)
                }
                if (currentFrameRef.current) {
                    currentFrameRef.current.currentTime = newTime
                }
                if (nextFrameRef.current) {
                    nextFrameRef.current.currentTime = Math.min(videoDuration, newTime + frameTime)
                }
            })
        })

        // Find which scene this time belongs to
        const sceneIndex = scenes.findIndex((scene, idx) => {
            const nextScene = scenes[idx + 1]
            return newTime >= scene.startTime && (!nextScene || newTime < nextScene.startTime)
        })
        if (sceneIndex !== -1) {
            setCurrentSceneIndex(sceneIndex)
        }
    }

    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        const ms = Math.floor((seconds % 1) * 1000)
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
    }

    if (loading) {
        return (
            <MainLayout>
                <Container maxW="full" py={8}>
                    <Text color="white">加载中...</Text>
                </Container>
            </MainLayout>
        )
    }

    if (error) {
        return (
            <MainLayout>
                <Container maxW="full" py={8}>
                    <Text color="red.400">{error}</Text>
                </Container>
            </MainLayout>
        )
    }

    return (
        <MainLayout>
            <Container maxW="full" py={6} px={20}>
                <Stack gap={4}>
                    {/* 顶部按钮和视频来源 */}
                    <HStack justify="space-between" w="full">
                        {/* 左侧：返回按钮 */}
                        <Link as={NextLink} href="/workspace/video-analysis" _hover={{ textDecoration: 'none' }}>
                            <Button
                                h="28px"
                                px={3}
                                borderRadius="full"
                                bg="whiteAlpha.200"
                                color="whiteAlpha.900"
                                _hover={{ bg: 'whiteAlpha.300', transform: 'translateX(-2px)' }}
                                transition="all 0.2s"
                                fontSize="xs"
                                fontWeight="medium"
                                display="flex"
                                alignItems="center"
                                gap={1}
                            >
                                <ChevronLeft size={14} />
                                返回
                            </Button>
                        </Link>

                        {/* 右侧：视频来源 */}
                        {(youtubeUrl || originalFilename) && (
                            <HStack gap={2} fontSize="sm" color="gray.300">
                                <Text color="gray.400"></Text>
                                {youtubeUrl ? (
                                    <Link
                                        href={youtubeUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        color="cyan.300"
                                        _hover={{ color: 'cyan.200', textDecoration: 'underline' }}
                                        fontWeight="medium"
                                    >
                                        🎬 {youtubeUrl.length > 50 ? youtubeUrl.substring(0, 50) + '...' : youtubeUrl}
                                    </Link>
                                ) : (
                                    <Text color="gray.200" fontWeight="medium">
                                        📄 {originalFilename}
                                    </Text>
                                )}
                            </HStack>
                        )}
                    </HStack>

                    {/* 四格预览 */}
                    <Grid templateColumns="repeat(4, 1fr)" gap={6}>
                        {/* 全视频 */}
                        <Box maxW="98%" mx="auto" w="full">
                            <Text color="gray.300" fontSize="sm" mb={2}>
                                全视频
                            </Text>
                            <Box
                                bg="black"
                                borderRadius="lg"
                                overflow="hidden"
                                border="2px solid"
                                borderColor="gray.700"
                                position="relative"
                                cursor="pointer"
                                onClick={() => {
                                    const video = videoRef.current
                                    if (!video) return

                                    // 播放当前分镜
                                    const currentScene = scenes[currentSceneIndex]
                                    if (currentScene) {
                                        video.currentTime = currentScene.startTime
                                        setCurrentTime(currentScene.startTime)
                                        video.play()
                                        setIsPlaying(true)
                                    }
                                }}
                                _hover={{
                                    '& .play-overlay': {
                                        opacity: 1,
                                    }
                                }}
                            >
                                <video
                                    ref={videoRef}
                                    src={videoUrl}
                                    style={{ width: '100%', height: 'auto', display: 'block' }}
                                />

                                {/* 播放图标覆盖层 */}
                                <Box
                                    className="play-overlay"
                                    position="absolute"
                                    top="50%"
                                    left="50%"
                                    transform="translate(-50%, -50%)"
                                    bg="rgba(0, 0, 0, 0.7)"
                                    borderRadius="full"
                                    p={4}
                                    opacity={0.6}
                                    transition="opacity 0.2s"
                                    pointerEvents="none"
                                >
                                    <Play size={48} color="white" fill="white" />
                                </Box>
                            </Box>
                        </Box>

                        {/* 上一帧 */}
                        <Box maxW="98%" mx="auto" w="full">
                            <Text color="gray.300" fontSize="sm" mb={2}>
                                上一帧 ({formatTime(Math.max(0, currentTime - 1 / videoFps))})
                            </Text>
                            <Box
                                bg="black"
                                borderRadius="lg"
                                overflow="hidden"
                                border="2px solid"
                                borderColor="gray.700"
                            >
                                <video
                                    ref={prevFrameRef}
                                    src={videoUrl}
                                    style={{ width: '100%', height: 'auto', display: 'block' }}
                                    muted
                                />
                            </Box>
                        </Box>

                        {/* 当前帧 */}
                        <Box maxW="98%" mx="auto" w="full">
                            <Text color="gray.300" fontSize="sm" mb={2}>
                                当前帧 ({formatTime(currentTime)})
                            </Text>
                            <Box
                                bg="black"
                                borderRadius="lg"
                                overflow="hidden"
                                border="2px solid"
                                borderColor="cyan.500"
                            >
                                <video
                                    ref={currentFrameRef}
                                    src={videoUrl}
                                    style={{ width: '100%', height: 'auto', display: 'block' }}
                                    muted
                                />
                            </Box>
                        </Box>

                        {/* 下一帧 */}
                        <Box maxW="98%" mx="auto" w="full">
                            <Text color="gray.300" fontSize="sm" mb={2}>
                                下一帧 ({formatTime(Math.min(videoDuration, currentTime + 1 / videoFps))})
                            </Text>
                            <Box
                                bg="black"
                                borderRadius="lg"
                                overflow="hidden"
                                border="2px solid"
                                borderColor="gray.700"
                            >
                                <video
                                    ref={nextFrameRef}
                                    src={videoUrl}
                                    style={{ width: '100%', height: 'auto', display: 'block' }}
                                    muted
                                />
                            </Box>
                        </Box>
                    </Grid>

                    {/* 时间轴和控制 */}
                    <Box
                        bg="gray.900"
                        border="1px solid"
                        borderColor="gray.700"
                        borderRadius="lg"
                        p={3}
                    >
                        <VStack gap={2} align="stretch">
                            {/* 时间轴 */}
                            <Box
                                position="relative"
                                h="50px"
                                bg="gray.800"
                                borderRadius="md"
                                cursor="pointer"
                                onClick={handleTimelineClick}
                                mt={6}
                            >
                                {/* 切点标记 */}
                                {scenes.map((scene, idx) => (
                                    <Box
                                        key={idx}
                                        position="absolute"
                                        left={`${(scene.startTime / videoDuration) * 100}%`}
                                        top="0"
                                        bottom="0"
                                        w="1px"
                                        bg={idx === currentSceneIndex ? 'cyan.400' : 'gray.500'}
                                        cursor="pointer"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleSceneClick(idx)
                                        }}
                                        _hover={{ bg: 'cyan.300' }}
                                        zIndex={5}
                                    >
                                        <Text
                                            position="absolute"
                                            top="-20px"
                                            left="50%"
                                            transform="translateX(-50%)"
                                            fontSize="xs"
                                            color={idx === currentSceneIndex ? 'cyan.300' : 'gray.400'}
                                            fontWeight="semibold"
                                            whiteSpace="nowrap"
                                        >
                                            {idx + 1}
                                        </Text>
                                    </Box>
                                ))}

                                {/* 播放头 */}
                                <Box
                                    position="absolute"
                                    left={`${(currentTime / videoDuration) * 100}%`}
                                    top="0"
                                    bottom="0"
                                    w="1px"
                                    bg="white"
                                    zIndex={10}
                                    pointerEvents="none"
                                >
                                    <Box
                                        position="absolute"
                                        top="50%"
                                        left="50%"
                                        transform="translate(-50%, -50%)"
                                        w="12px"
                                        h="12px"
                                        bg="white"
                                        borderRadius="full"
                                        boxShadow="0 0 8px rgba(255, 255, 255, 0.5)"
                                    />
                                </Box>
                            </Box>

                            {/* 时间显示 */}
                            <HStack justify="space-between" fontSize="sm" color="gray.300">
                                <Text>{formatTime(currentTime)}</Text>
                                <Text>共 {scenes.length} 个分镜</Text>
                                <Text>{formatTime(videoDuration)}</Text>
                            </HStack>

                            {/* 控制按钮 - 左右分组 */}
                            <HStack justify="space-between" pt={1}>
                                {/* 左侧：播放和重播 */}
                                <HStack gap={2}>
                                    {/* 播放按钮 - 只有图标 */}
                                    <Button
                                        onClick={handlePlay}
                                        w="32px"
                                        h="32px"
                                        borderRadius="full"
                                        bg="blue.500"
                                        color="white"
                                        _hover={{ bg: 'blue.600' }}
                                        display="flex"
                                        alignItems="center"
                                        justifyContent="center"
                                        p={0}
                                        minW="32px"
                                    >
                                        {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                                    </Button>

                                    {/* 重播片段按钮 */}
                                    <Button
                                        onClick={handleReplay}
                                        h="32px"
                                        px={3}
                                        borderRadius="full"
                                        bg="green.500"
                                        color="white"
                                        _hover={{ bg: 'green.600' }}
                                        fontSize="xs"
                                        fontWeight="medium"
                                    >
                                        🔄 重播片段
                                    </Button>

                                    {/* 物理切分按钮 */}
                                    <Button
                                        onClick={handlePhysicalSplit}
                                        h="32px"
                                        px={3}
                                        borderRadius="full"
                                        bg={saveSuccess ? 'green.500' : 'purple.500'}
                                        color="white"
                                        _hover={{ bg: saveSuccess ? 'green.600' : 'purple.600' }}
                                        fontSize="xs"
                                        fontWeight="medium"
                                        disabled={saving}
                                    >
                                        {saving ? '⏳ 切分中...' : (saveSuccess ? '✓ 切分完成' : '✂️ 物理切分')}
                                    </Button>

                                    {/* 打开目录按钮 */}
                                    <Button
                                        onClick={async () => {
                                            try {
                                                // 构建项目输出目录路径
                                                const projectDir = `/data/analysis/${jobId}/split`
                                                await videoService.openInFinder(projectDir)
                                            } catch (error: any) {
                                                alert('打开目录失败: ' + error.message)
                                            }
                                        }}
                                        h="32px"
                                        px={3}
                                        borderRadius="full"
                                        bg="orange.500"
                                        color="white"
                                        _hover={{ bg: 'orange.600' }}
                                        fontSize="xs"
                                        fontWeight="medium"
                                    >
                                        📁 打开目录
                                    </Button>

                                    {/* 复制信息按钮 */}
                                    <Button
                                        onClick={handleCopyInfo}
                                        h="32px"
                                        px={3}
                                        borderRadius="full"
                                        bg={copied ? 'purple.500' : 'gray.600'}
                                        color="white"
                                        _hover={{ bg: copied ? 'purple.600' : 'gray.700' }}
                                        fontSize="xs"
                                        fontWeight="medium"
                                    >
                                        {copied ? '✓ 已复制' : '复制信息'}
                                    </Button>
                                </HStack>

                                {/* 右侧：上一帧、下一帧、添加和删除 */}
                                <HStack gap={2}>
                                    {/* 上一帧按钮 */}
                                    <Button
                                        onClick={handlePrevFrame}
                                        h="24px"
                                        px={2}
                                        borderRadius="lg"
                                        bg="white"
                                        color="gray.700"
                                        _hover={{ bg: 'gray.100' }}
                                        fontSize="xs"
                                        fontWeight="medium"
                                        border="1px solid"
                                        borderColor="gray.300"
                                    >
                                        上一帧
                                    </Button>

                                    {/* 下一帧按钮 */}
                                    <Button
                                        onClick={handleNextFrame}
                                        h="24px"
                                        px={2}
                                        borderRadius="lg"
                                        bg="white"
                                        color="gray.700"
                                        _hover={{ bg: 'gray.100' }}
                                        fontSize="xs"
                                        fontWeight="medium"
                                        border="1px solid"
                                        borderColor="gray.300"
                                    >
                                        下一帧
                                    </Button>

                                    {/* 添加切点按钮 */}
                                    <Button
                                        onClick={handleAddCutPoint}
                                        h="24px"
                                        px={2}
                                        borderRadius="lg"
                                        bg="white"
                                        color="gray.700"
                                        _hover={{ bg: 'gray.100' }}
                                        fontSize="xs"
                                        fontWeight="medium"
                                        border="1px solid"
                                        borderColor="gray.300"
                                    >
                                        <Plus size={12} style={{ marginRight: '0px' }} />
                                        添加切点
                                    </Button>

                                    {/* 删除按钮 */}
                                    <Button
                                        onClick={handleDeleteCutPoint}
                                        h="24px"
                                        px={2}
                                        borderRadius="lg"
                                        bg="white"
                                        color="gray.700"
                                        _hover={{ bg: 'gray.100' }}
                                        fontSize="xs"
                                        fontWeight="medium"
                                        border="1px solid"
                                        borderColor="gray.300"
                                    >
                                        <Trash2 size={12} style={{ marginRight: '4px' }} />
                                        删除切点
                                    </Button>
                                </HStack>
                            </HStack>
                        </VStack>
                    </Box>
                </Stack>
            </Container>
        </MainLayout>
    )
}

export default function VideoEditPage() {
    return (
        <Suspense fallback={
            <MainLayout>
                <Container maxW="full" py={8}>
                    <Text color="white">加载中...</Text>
                </Container>
            </MainLayout>
        }>
            <VideoEditContent />
        </Suspense>
    )
}
