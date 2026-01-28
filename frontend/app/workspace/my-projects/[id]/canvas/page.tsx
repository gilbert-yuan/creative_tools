'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ProjectWithScenes, GenerationHistory } from '@/types/project';
import MainLayout from '@/components/MainLayout';
import {
    Container,
    Box,
    Text,
    Flex,
    Button,
    Spinner,
    Center,
    SimpleGrid,
    Image,
    Stack,
    IconButton,
    Badge
} from '@chakra-ui/react';
import { ArrowLeft, Clock, Grid as GridIcon, Image as ImageIcon, Film as FilmIcon, FolderOpen, RefreshCcw, Upload, X } from 'lucide-react';

export default function CanvasPage() {
    const params = useParams();
    const projectId = params.id as string;
    const [projectData, setProjectData] = useState<ProjectWithScenes | null>(null);
    const [historyData, setHistoryData] = useState<GenerationHistory[]>([]);
    const [loading, setLoading] = useState(true);

    // Tabs: 'image' (First Frame) or 'video' (Storyboard)
    const [activeTab, setActiveTab] = useState<'image' | 'video'>('image');
    // View Mode: 'latest' or 'history'
    const [viewMode, setViewMode] = useState<'latest' | 'history'>('latest');

    // Replacement State
    const [replacingSceneId, setReplacingSceneId] = useState<number | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [hoveredSceneId, setHoveredSceneId] = useState<number | null>(null);

    // Export State
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        loadData();
    }, [projectId]);

    const loadData = async () => {
        try {
            const [projRes, histRes] = await Promise.all([
                fetch(`http://localhost:3001/api/projects/${projectId}`),
                fetch(`http://localhost:3001/api/projects/${projectId}/history`)
            ]);

            if (projRes.ok) {
                setProjectData(await projRes.json());
            }
            if (histRes.ok) {
                const history = await histRes.json();
                setHistoryData(history);
            }
        } catch (error) {
            console.error('Failed to load canvas data:', error);
        } finally {
            setLoading(false);
        }
    };

    const getImageUrl = (url: string) => {
        if (!url) return '';
        if (url.startsWith('http')) return url;
        return `http://localhost:3001${url}`;
    };

    const handleRevealFile = async () => {
        try {
            // The backend expects a file_path, but will also accept a directory if we construct it right.
            // Based on backend logic `data/projects/{projectId}` seems correct.
            // Backend `reveal_file_in_finder` takes `file_path`.

            const response = await fetch('http://localhost:3001/api/files/reveal', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    file_path: `data/projects/${projectId}`
                }),
            });

            if (!response.ok) {
                console.error('Failed to reveal file');
            }
        } catch (error) {
            console.error('Error revealing file:', error);
        }
    };

    const handleFileUpload = async (file: File, sceneId: number) => {
        if (!file) return;

        // Basic validation
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');

        if (activeTab === 'image' && !isImage) {
            alert('请上传图片文件');
            return;
        }
        if (activeTab === 'video' && !isVideo) {
            alert('请上传视频文件');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('generation_type', activeTab);
        formData.append('prompt', 'Manual Replacement');

        setIsUploading(true);
        try {
            const res = await fetch(`http://localhost:3001/api/projects/${projectId}/scenes/${sceneId}/upload`, {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                await loadData();
                setReplacingSceneId(null);
            } else {
                console.error('Upload failed');
                alert('上传失败，请重试');
            }
        } catch (error) {
            console.error('Error uploading file:', error);
            alert('上传出错');
        } finally {
            setIsUploading(false);
        }
    };

    const handleExportVideos = async () => {
        setIsExporting(true);
        try {
            const response = await fetch(`http://localhost:3001/api/projects/${projectId}/export-videos`, {
                method: 'POST',
            });

            if (response.ok) {
                const data = await response.json();
                alert(`导出成功！共导出 ${data.video_count} 个最新分镜视频到临时目录`);
            } else {
                const errorData = await response.json();
                alert(errorData.error || '导出失败');
            }
        } catch (error) {
            console.error('导出失败:', error);
            alert('导出失败，请重试');
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportImages = async () => {
        setIsExporting(true);
        try {
            const response = await fetch(`http://localhost:3001/api/projects/${projectId}/export-images`, {
                method: 'POST',
            });

            if (response.ok) {
                const data = await response.json();
                alert(`导出成功！共导出 ${data.image_count} 个首帧图到临时目录`);
            } else {
                const errorData = await response.json();
                alert(errorData.error || '导出失败');
            }
        } catch (error) {
            console.error('导出失败:', error);
            alert('导出失败，请重试');
        } finally {
            setIsExporting(false);
        }
    };

    const processedHistory = useMemo(() => {
        if (!historyData || !projectData) return {};

        // Group history by scene_index
        const grouped: Record<number, GenerationHistory[]> = {};

        // Map sceneId to sceneIndex
        const sceneIdToIndex = new Map(projectData.scenes.map(s => [s.id, s.scene_index]));

        historyData.forEach(item => {
            const sceneIndex = sceneIdToIndex.get(item.scene_id);
            if (sceneIndex !== undefined) {
                // Filter by type
                // Note: database generation_type for first_frame is "image", for video is "video"
                // This matches our activeTab values exactly.

                if (item.generation_type === activeTab) {
                    if (!grouped[sceneIndex]) grouped[sceneIndex] = [];
                    grouped[sceneIndex].push(item);
                }
            }
        });

        return grouped;
    }, [historyData, projectData, activeTab]);

    if (loading) return (
        <Box minH="100vh" bg="gray.900" color="white">
            <Center minH="100vh">
                <Stack align="center" gap={4}>
                    <Spinner size="xl" color="blue.500" />
                    <Text color="gray.400">加载画布数据...</Text>
                </Stack>
            </Center>
        </Box>
    );

    if (!projectData) return (
        <Box minH="100vh" bg="gray.900" color="white">
            <Center minH="100vh"><Text color="gray.400">项目不存在</Text></Center>
        </Box>
    );

    return (
        <Box minH="100vh" bg="gray.900" color="white">
            {/* Custom Header Bar */}
            <Box bg="gray.900" borderBottom="1px" borderColor="whiteAlpha.100" position="sticky" top={0} zIndex={50} px={4} py={2}>
                <Flex justify="space-between" align="center">
                    {/* Left Side: Title & Back */}
                    <Flex align="center" gap={3}>
                        <Link href={`/workspace/my-projects/${projectId}`}>
                            <IconButton
                                aria-label="Back"
                                variant="ghost"
                                color="gray.400"
                                _hover={{ color: 'white', bg: 'whiteAlpha.200' }}
                                size="xs"
                            >
                                <ArrowLeft size={16} />
                            </IconButton>
                        </Link>
                        <Box
                            bg="blue.900"
                            px={3}
                            py={1}
                            borderRadius="full"
                            border="1px solid"
                            borderColor="blue.700"
                        >
                            <Text
                                fontSize="xs"
                                fontWeight="bold"
                                color="blue.100"
                                maxW="20em"
                                truncate
                                title={projectData.project.title}
                            >
                                {projectData.project.title}
                            </Text>
                        </Box>
                    </Flex>

                    {/* Right Side: Tabs & View Mode */}
                    <Flex align="center" gap={3}>
                        {/* Reveal File Button */}
                        <IconButton
                            aria-label="Reveal File"
                            size="xs"
                            colorPalette="blue"
                            variant="ghost"
                            color="gray.400"
                            _hover={{ color: 'white', bg: 'whiteAlpha.200' }}
                            onClick={handleRevealFile}
                            title="打开所在目录"
                        >
                            <FolderOpen size={16} />
                        </IconButton>

                        {/* Export Images Button (only show when activeTab is 'image' and viewMode is 'latest') */}
                        {activeTab === 'image' && viewMode === 'latest' && (
                            <Button
                                size="xs"
                                colorPalette="green"
                                variant="solid"
                                onClick={handleExportImages}
                                loading={isExporting}
                                title="导出所有首帧图"
                                px={3}
                                h="28px"
                            >
                                <FolderOpen size={14} style={{ marginRight: '4px' }} />
                                导出
                            </Button>
                        )}

                        {/* Export Videos Button (only show when activeTab is 'video') */}
                        {activeTab === 'video' && (
                            <Button
                                size="xs"
                                colorPalette="green"
                                variant="solid"
                                onClick={handleExportVideos}
                                loading={isExporting}
                                title="导出所有分镜视频"
                                px={3}
                                h="28px"
                            >
                                <FolderOpen size={14} style={{ marginRight: '4px' }} />
                                导出视频
                            </Button>
                        )}

                        {/* Tabs: Image vs Video */}
                        <Flex bg="whiteAlpha.100" p={0.5} borderRadius="md" border="1px solid" borderColor="whiteAlpha.100">
                            <Button
                                size="xs"
                                px={2}
                                h="24px"
                                variant={activeTab === 'image' ? 'solid' : 'ghost'}
                                colorPalette="blue"
                                bg={activeTab === 'image' ? 'blue.600' : 'transparent'}
                                color={activeTab === 'image' ? 'white' : 'gray.400'}
                                onClick={() => setActiveTab('image')}
                                _hover={{ bg: activeTab === 'image' ? 'blue.700' : 'whiteAlpha.100' }}
                            >
                                <ImageIcon size={12} style={{ marginRight: '4px' }} /> 首帧图
                            </Button>
                            <Button
                                size="xs"
                                px={2}
                                h="24px"
                                variant={activeTab === 'video' ? 'solid' : 'ghost'}
                                colorPalette="blue"
                                bg={activeTab === 'video' ? 'blue.600' : 'transparent'}
                                color={activeTab === 'video' ? 'white' : 'gray.400'}
                                onClick={() => setActiveTab('video')}
                                _hover={{ bg: activeTab === 'video' ? 'blue.700' : 'whiteAlpha.100' }}
                            >
                                <FilmIcon size={12} style={{ marginRight: '4px' }} /> 分镜视频
                            </Button>
                        </Flex>

                        {/* View Mode: Latest vs History */}
                        <Flex bg="whiteAlpha.100" p={0.5} borderRadius="md" border="1px solid" borderColor="whiteAlpha.100">
                            <Button
                                size="xs"
                                px={2}
                                h="24px"
                                variant={viewMode === 'latest' ? 'solid' : 'ghost'}
                                colorPalette="green"
                                bg={viewMode === 'latest' ? 'green.600' : 'transparent'}
                                color={viewMode === 'latest' ? 'white' : 'gray.400'}
                                onClick={() => setViewMode('latest')}
                                _hover={{ bg: viewMode === 'latest' ? 'green.700' : 'whiteAlpha.100' }}
                            >
                                <GridIcon size={12} style={{ marginRight: '4px' }} /> 最新
                            </Button>
                            <Button
                                size="xs"
                                px={2}
                                h="24px"
                                variant={viewMode === 'history' ? 'solid' : 'ghost'}
                                colorPalette="purple"
                                bg={viewMode === 'history' ? 'purple.600' : 'transparent'}
                                color={viewMode === 'history' ? 'white' : 'gray.400'}
                                onClick={() => setViewMode('history')}
                                _hover={{ bg: viewMode === 'history' ? 'purple.700' : 'whiteAlpha.100' }}
                            >
                                <Clock size={12} style={{ marginRight: '4px' }} /> 全历史
                            </Button>
                        </Flex>
                    </Flex>
                </Flex>
            </Box>

            <Box p={6}>

                {/* Content */}
                {viewMode === 'latest' ? (
                    <SimpleGrid columns={{ base: 2, md: 3, lg: 4, xl: 5 }} gap={6}>
                        {projectData.scenes.map(scene => {
                            const url = activeTab === 'image' ? scene.latest_image_url : scene.latest_video_url;
                            const isReplacing = replacingSceneId === scene.id;
                            const isHovered = hoveredSceneId === scene.id;

                            return (
                                <Box
                                    key={scene.id}
                                    bg="whiteAlpha.50"
                                    borderRadius="none"
                                    overflow="hidden"
                                    position="relative"
                                    border="1px solid"
                                    borderColor="whiteAlpha.200"
                                    transition="all 0.2s"
                                    _hover={{ transform: isReplacing ? 'none' : 'translateY(-4px)', boxShadow: isReplacing ? 'none' : 'xl' }}
                                    onMouseEnter={() => setHoveredSceneId(scene.id)}
                                    onMouseLeave={() => setHoveredSceneId(null)}
                                >
                                    <Box position="absolute" top={2} left={2} bg="blackAlpha.700" px={2} py={1} borderRadius="md" zIndex={2}>
                                        <Text fontSize="xs" fontWeight="bold" color="white">Scene {scene.scene_index}</Text>
                                    </Box>

                                    {/* Replace Button (Show on hover if not replacing) */}
                                    {!isReplacing && (
                                        <IconButton
                                            aria-label="Replace"
                                            size="xs"
                                            position="absolute"
                                            top={2}
                                            right={2}
                                            zIndex={10}
                                            colorScheme="blue"
                                            bg="blue.600"
                                            _hover={{ bg: 'blue.500' }}
                                            opacity={isHovered ? 1 : 0}
                                            transition="opacity 0.2s"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setReplacingSceneId(scene.id);
                                            }}
                                            title="替换素材"
                                        >
                                            <RefreshCcw size={14} />
                                        </IconButton>
                                    )}

                                    <Box aspectRatio="auto" bg="blackAlpha.400" position="relative">
                                        {isReplacing ? (
                                            <Flex
                                                direction="column"
                                                align="center"
                                                justify="center"
                                                w="full"
                                                h="full"
                                                border="2px dashed"
                                                borderColor="blue.500"
                                                bg="blue.900"
                                                color="blue.200"
                                                cursor="pointer"
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    const file = e.dataTransfer.files[0];
                                                    handleFileUpload(file, scene.id);
                                                }}
                                                onClick={() => document.getElementById(`file-upload-${scene.id}`)?.click()}
                                                p={4}
                                                textAlign="center"
                                            >
                                                <input
                                                    type="file"
                                                    id={`file-upload-${scene.id}`}
                                                    style={{ display: 'none' }}
                                                    accept={activeTab === 'image' ? "image/*" : "video/*"}
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) handleFileUpload(file, scene.id);
                                                    }}
                                                />
                                                {isUploading ? (
                                                    <Spinner size="sm" />
                                                ) : (
                                                    <>
                                                        <Upload size={24} style={{ marginBottom: '8px' }} />
                                                        <Text fontSize="xs">点击或拖拽上传</Text>
                                                        <IconButton
                                                            aria-label="Cancel"
                                                            size="xs"
                                                            variant="ghost"
                                                            color="red.300"
                                                            _hover={{ bg: 'red.900' }}
                                                            position="absolute"
                                                            top={1}
                                                            right={1}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setReplacingSceneId(null);
                                                            }}
                                                        >
                                                            <X size={14} />
                                                        </IconButton>
                                                    </>
                                                )}
                                            </Flex>
                                        ) : (
                                            url ? (
                                                activeTab === 'image' ? (
                                                    <Image src={getImageUrl(url)} w="full" h="auto" objectFit="contain" />
                                                ) : (
                                                    <video
                                                        src={getImageUrl(url)}
                                                        poster={scene.latest_image_url ? getImageUrl(scene.latest_image_url) : undefined}
                                                        controls
                                                        style={{ width: '100%', height: 'auto', objectFit: 'contain' }}
                                                    />
                                                )
                                            ) : (
                                                <Center h="full"><Text fontSize="sm" color="gray.500">None</Text></Center>
                                            )
                                        )}
                                    </Box>
                                </Box>
                            );
                        })}
                    </SimpleGrid>
                ) : (
                    <Stack gap={2}>
                        {projectData.scenes.map(scene => {
                            const historyItems = processedHistory[scene.scene_index] || [];
                            // Should we show empty rows? Yes, to show the scene exists.

                            return (
                                <Box key={scene.id} position="relative">


                                    {historyItems.length > 0 ? (
                                        <Flex gap={4} overflowX="auto" pb={4} css={{
                                            '&::-webkit-scrollbar': { height: '8px' },
                                            '&::-webkit-scrollbar-track': { background: 'rgba(255,255,255,0.05)' },
                                            '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.2)', borderRadius: '4px' },
                                            '&::-webkit-scrollbar-thumb:hover': { background: 'rgba(255,255,255,0.3)' },
                                        }}>
                                            {historyItems.map((item, idx) => (
                                                <Box key={item.id} flexShrink={0} w="180px">
                                                    <Box position="relative">

                                                        <Box aspectRatio="auto" bg="blackAlpha.500" borderRadius="none" overflow="hidden" mb={2}>
                                                            {activeTab === 'image' ? (
                                                                <Image src={getImageUrl(item.result_url)} w="full" h="auto" objectFit="contain" />
                                                            ) : (
                                                                <video src={getImageUrl(item.result_url)} controls style={{ width: '100%', height: 'auto', objectFit: 'contain' }} />
                                                            )}
                                                        </Box>
                                                    </Box>
                                                </Box>
                                            ))}
                                        </Flex>
                                    ) : (
                                        <Center h="100px" bg="whiteAlpha.50" borderRadius="lg" borderStyle="dashed" borderWidth="1px" borderColor="whiteAlpha.200">
                                            <Text color="gray.500">暂无历史记录</Text>
                                        </Center>
                                    )}
                                </Box>
                            );
                        })}
                    </Stack>
                )}
            </Box>
        </Box>
    );
}
