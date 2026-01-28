'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { GenerationHistory } from '@/types/project';
import MainLayout from '@/components/MainLayout';
import {
    Container,
    Box,
    Text,
    Stack,
    Spinner,
    Center,
    Image,
    SimpleGrid,
} from '@chakra-ui/react';

export default function HistoryPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const projectId = params.id as string;
    const sceneId = params.sceneId as string;
    const type = (searchParams.get('type') || 'image') as 'image' | 'video';
    const sceneIndex = searchParams.get('scene') || '';

    const [history, setHistory] = useState<GenerationHistory[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadHistory();
    }, [projectId, sceneId, type]);

    const loadHistory = async () => {
        try {
            const response = await fetch(
                `http://localhost:3001/api/projects/${projectId}/scenes/${sceneId}/history?type=${type}`
            );
            const data = await response.json();
            // Filter out items without result_url
            const validHistory = data.filter((item: GenerationHistory) => item.result_url);
            setHistory(validHistory);
        } catch (error) {
            console.error('加载历史失败:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatDateTime = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    };

    const handleDelete = async (historyId: number) => {
        if (!confirm('确定要删除这条记录吗？图片文件也将被删除。')) return;

        try {
            const response = await fetch(
                `http://localhost:3001/api/projects/${projectId}/scenes/${sceneId}/history/${historyId}`,
                { method: 'DELETE' }
            );
            if (response.ok) {
                setHistory(prev => prev.filter(h => h.id !== historyId));
            } else {
                console.error('删除失败');
                alert('删除失败');
            }
        } catch (error) {
            console.error('删除请求出错:', error);
            alert('删除出错');
        }
    }

    const handleSetLatest = async (historyId: number) => {
        try {
            const response = await fetch(
                `http://localhost:3001/api/projects/${projectId}/scenes/${sceneId}/history/${historyId}/set-latest`,
                { method: 'PUT' }
            );
            if (response.ok) {
                // 刷新列表以显示新的排序
                await loadHistory();
            } else {
                console.error('设置失败');
                alert('设置失败');
            }
        } catch (error) {
            console.error('设置请求出错:', error);
            alert('设置出错');
        }
    }

    return (
        <MainLayout>
            <Container maxW="7xl" py={6}>
                <Box mb={6}>
                    <Link href={`/workspace/my-projects/${projectId}?tab=${type === 'image' ? 'first-frame' : 'storyboard'}`}>
                        <Text color="blue.400" _hover={{ color: 'blue.300' }} fontSize="sm" display="inline-block">
                            ← 返回{type === 'image' ? '首帧图绘制' : '分镜生成'}
                        </Text>
                    </Link>
                    <Text fontSize="xl" fontWeight="bold" color="white" mt={2}>
                        分镜 #{sceneIndex} - 历史记录
                    </Text>
                    <Text fontSize="sm" color="gray.400" mt={1}>
                        {type === 'image' ? '首帧图' : '视频'}生成历史
                    </Text>
                </Box>

                {loading ? (
                    <Center py={20}>
                        <Stack align="center" gap={4}>
                            <Spinner size="xl" color="blue.500" />
                            <Text color="gray.400">加载中...</Text>
                        </Stack>
                    </Center>
                ) : history.length === 0 ? (
                    <Center py={20}>
                        <Text color="gray.400">暂无历史记录</Text>
                    </Center>
                ) : (
                    <Stack gap={4}>
                        {history.map((item) => (
                            <Box
                                key={item.id}
                                bg="rgba(26, 32, 44, 0.6)" // semi-transparent background
                                backdropFilter="blur(12px)" // frosted glass effect
                                border="1px solid rgba(255, 255, 255, 0.08)"
                                borderRadius="xl"
                                p={4}
                                position="relative"
                                _hover={{
                                    bg: "rgba(26, 32, 44, 0.7)",
                                    transform: "translateY(-1px)",
                                    transition: "all 0.2s"
                                }}
                            >
                                {/* 删除按钮 */}
                                <Box
                                    position="absolute"
                                    top={4}
                                    right={4}
                                    cursor="pointer"
                                    onClick={() => handleDelete(item.id)}
                                    color="gray.500"
                                    _hover={{ color: "red.400" }}
                                    zIndex={1}
                                >
                                    <Text fontSize="md">🗑️</Text>
                                </Box>

                                {/* 设置为最新按钮 */}
                                <Box
                                    position="absolute"
                                    top={4}
                                    right={12}
                                    cursor="pointer"
                                    onClick={() => handleSetLatest(item.id)}
                                    bg="rgba(66, 153, 225, 0.2)"
                                    px={3}
                                    py={1}
                                    borderRadius="md"
                                    border="1px solid rgba(66, 153, 225, 0.3)"
                                    color="blue.300"
                                    fontSize="xs"
                                    fontWeight="medium"
                                    _hover={{
                                        bg: "rgba(66, 153, 225, 0.3)",
                                        color: "blue.200",
                                        transform: "translateY(-1px)",
                                        transition: "all 0.2s"
                                    }}
                                    zIndex={1}
                                >
                                    设置为最新
                                </Box>

                                {/* 生成时间 */}
                                <Text fontSize="xs" color="gray.400" mb={3}>
                                    {formatDateTime(item.created_at)}
                                </Text>

                                {/* 内容区域：左侧媒体，右侧提示词 */}
                                <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
                                    {/* 左侧：媒体预览 - 自适应比例 */}
                                    <Box maxW="300px">
                                        <Box
                                            bg="blackAlpha.400"
                                            borderRadius="lg"
                                            overflow="hidden"
                                            border="1px solid rgba(255, 255, 255, 0.05)"
                                        >
                                            {type === 'image' ? (
                                                <Image
                                                    src={item.result_url}
                                                    alt="历史记录"
                                                    w="100%"
                                                    h="auto"
                                                />
                                            ) : (
                                                <video
                                                    src={item.result_url}
                                                    controls
                                                    style={{ width: '100%', height: 'auto' }}
                                                />
                                            )}
                                        </Box>
                                    </Box>

                                    {/* 右侧：提示词 */}
                                    <Box flex={1}>
                                        <Text fontSize="xs" fontWeight="medium" color="whiteAlpha.900" mb={2}>
                                            {type === 'image' ? '首帧图提示词' : '视频提示词'}
                                        </Text>
                                        <Box
                                            bg="rgba(0, 0, 0, 0.3)"
                                            borderRadius="lg"
                                            p={4}
                                            minH="100px"
                                            border="1px solid rgba(255, 255, 255, 0.05)"
                                        >
                                            <Text fontSize="sm" color={item.prompt ? 'whiteAlpha.900' : 'whiteAlpha.500'} lineHeight="1.6">
                                                {item.prompt || '无提示词'}
                                            </Text>
                                        </Box>
                                    </Box>
                                </SimpleGrid>
                            </Box>
                        ))}
                    </Stack>
                )}
            </Container>
        </MainLayout>
    );
}
