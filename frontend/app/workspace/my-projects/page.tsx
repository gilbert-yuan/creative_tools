'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Project } from '@/types/project';
import MainLayout from '@/components/MainLayout';
import { Trash2 } from 'lucide-react';
import {
    Container,
    Stack,
    Box,
    Text,
    SimpleGrid,
    Button,
    IconButton,
    Flex,
    Input,
    Spinner,
    Center,
} from '@chakra-ui/react';

export default function MyProjectsPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [showDialog, setShowDialog] = useState(false);
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

    useEffect(() => {
        loadProjects();
    }, []);

    const loadProjects = async () => {
        try {
            const response = await fetch('http://localhost:3001/api/projects');
            const data = await response.json();
            setProjects(data);
        } catch (error) {
            console.error('加载项目失败:', error);
        } finally {
            setLoading(false);
        }
    };

    // Pagination Logic
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentProjects = projects.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(projects.length / itemsPerPage);

    const handlePageChange = (pageNumber: number) => {
        setCurrentPage(pageNumber);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setUploadedFile(e.target.files[0]);
        }
    };

    const handleCreateProject = async () => {
        if (!uploadedFile) {
            alert('请选择 JSON 文件');
            return;
        }

        setUploading(true);
        try {
            const fileContent = await uploadedFile.text();
            const projectData = JSON.parse(fileContent);

            const response = await fetch('http://localhost:3001/api/projects', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(projectData),
            });

            if (response.ok) {
                const result = await response.json();
                setShowDialog(false);
                setUploadedFile(null);
                loadProjects();

                // 跳转到项目详情页
                window.location.href = `/workspace/my-projects/${result.project_id}`;
            } else {
                alert('项目创建失败');
            }
        } catch (error) {
            console.error('创建项目失败:', error);
            alert('JSON 格式错误或创建失败');
        } finally {
            setUploading(false);
        }
    };

    const handleDownloadVideoTemplate = async () => {
        try {
            const response = await fetch('http://localhost:3001/api/projects/template/video');
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = '项目模板（视频）.json';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('下载模板失败:', error);
        }
    };

    const handleDownloadComicTemplate = async () => {
        try {
            const response = await fetch('http://localhost:3001/api/projects/template/comic');
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = '项目模板（漫画）.json';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('下载模板失败:', error);
        }
    };

    const handleDeleteProject = async (projectId: string) => {
        try {
            const response = await fetch(`http://localhost:3001/api/projects/${projectId}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                loadProjects(); // 重新加载项目列表
            } else {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error || '未知错误';
                console.error('删除失败:', errorMessage);
                alert(`项目删除失败: ${errorMessage}`);
            }
        } catch (error) {
            console.error('删除项目失败:', error);
            alert(`删除项目失败: ${error instanceof Error ? error.message : '网络错误'}`);
        }
    };

    const formatRelativeTime = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (diffInSeconds < 60) return '刚刚';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} 分钟前`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} 小时前`;
        if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} 天前`;
        return date.toLocaleDateString();
    };

    return (
        <MainLayout>
            <Container maxW="7xl" py={12}>
                <Stack gap={8}>
                    {/* 页头 */}
                    <Flex justify="space-between" align="center" mb={6}>
                        <Text fontSize="xl" fontWeight="bold" color="white">
                            我的项目
                        </Text>

                        {/* 操作按钮 */}
                        <Flex gap={4}>
                            <Button colorPalette="blue" onClick={() => setShowDialog(true)}>
                                + 创建项目
                            </Button>
                            <Button bg="whiteAlpha.200" color="white" _hover={{ bg: 'whiteAlpha.300' }} onClick={handleDownloadVideoTemplate}>
                                📥 下载 JSON 模板（视频）
                            </Button>
                            <Button bg="whiteAlpha.200" color="white" _hover={{ bg: 'whiteAlpha.300' }} onClick={handleDownloadComicTemplate}>
                                📥 下载 JSON 模板（漫画）
                            </Button>
                        </Flex>
                    </Flex>

                    {/* 项目列表 */}
                    <Box>
                        {loading ? (
                            <Center py={20}>
                                <Stack align="center" gap={4}>
                                    <Spinner size="xl" color="blue.500" />
                                    <Text color="gray.400">加载中...</Text>
                                </Stack>
                            </Center>
                        ) : projects.length === 0 ? (
                            <Center py={20}>
                                <Text color="gray.400" fontSize="lg">
                                    暂无项目，点击上方按钮创建第一个项目
                                </Text>
                            </Center>
                        ) : (
                            <>
                                <SimpleGrid columns={{ base: 1, md: 2, lg: 3, xl: 4 }} gap={6}>
                                    {currentProjects.map((project) => (
                                        <Box
                                            key={project.id}
                                            className="group"
                                            bg="whiteAlpha.50"
                                            backdropFilter="blur(10px)"
                                            borderRadius="lg"
                                            border="1px"
                                            borderColor="whiteAlpha.100"
                                            overflow="hidden"
                                            _hover={{ borderColor: 'blue.400', transform: 'translateY(-2px)', bg: 'whiteAlpha.100' }}
                                            transition="all 0.2s"
                                            position="relative"
                                            css={{
                                                '&:hover .delete-btn': {
                                                    opacity: 1,
                                                }
                                            }}
                                        >
                                            {/* 删除按钮 */}
                                            <IconButton
                                                className="delete-btn"
                                                aria-label="删除项目"
                                                position="absolute"
                                                top={2}
                                                right={2}
                                                size="sm"
                                                bg="red.500"
                                                color="white"
                                                _hover={{ bg: "red.600" }}
                                                zIndex={20}
                                                opacity={0}
                                                transition="opacity 0.2s"
                                                onClick={(e: React.MouseEvent) => {
                                                    e.stopPropagation();
                                                    if (window.confirm(`确定要删除项目"${project.title || '未命名项目'}"吗？此操作不可恢复。`)) {
                                                        handleDeleteProject(project.id);
                                                    }
                                                }}
                                            >
                                                <Trash2 size={16} />
                                            </IconButton>

                                            {/* 可点击区域 */}
                                            <Box
                                                cursor="pointer"
                                                onClick={() => window.location.href = `/workspace/my-projects/${project.id}`}
                                            >
                                                {/* 封面图 */}
                                                <Box bg="whiteAlpha.100" h="140px" position="relative">
                                                    {project.cover_image_url ? (
                                                        <img
                                                            src={
                                                                project.cover_image_url.startsWith('http')
                                                                    ? project.cover_image_url
                                                                    : `http://localhost:3001${project.cover_image_url}`
                                                            }
                                                            alt={project.title}
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                        />
                                                    ) : (
                                                        <Center h="full">
                                                            <Text color="whiteAlpha.500" fontSize="3xl">
                                                                📽️
                                                            </Text>
                                                        </Center>
                                                    )}
                                                </Box>

                                                {/* 项目信息 */}
                                                <Box p={3}>
                                                    <Text fontSize="md" fontWeight="semibold" color="white" mb={1} lineClamp={1}>
                                                        {project.title || '未命名项目'}
                                                    </Text>
                                                    <Text fontSize="xs" color="gray.400">
                                                        {formatRelativeTime(project.created_at)}
                                                    </Text>
                                                </Box>
                                            </Box>
                                        </Box>
                                    ))}
                                </SimpleGrid>

                                {/* 分页控件 */}
                                {totalPages > 1 && (
                                    <Flex justify="center" align="center" mt={8} gap={4}>
                                        <Button
                                            onClick={() => handlePageChange(currentPage - 1)}
                                            disabled={currentPage === 1}
                                            variant="ghost"
                                            color="white"
                                            _hover={{ bg: 'whiteAlpha.200' }}
                                            _disabled={{ opacity: 0.5, cursor: 'not-allowed' }}
                                        >
                                            上一页
                                        </Button>
                                        <Text color="white">
                                            {currentPage} / {totalPages}
                                        </Text>
                                        <Button
                                            onClick={() => handlePageChange(currentPage + 1)}
                                            disabled={currentPage === totalPages}
                                            variant="ghost"
                                            color="white"
                                            _hover={{ bg: 'whiteAlpha.200' }}
                                            _disabled={{ opacity: 0.5, cursor: 'not-allowed' }}
                                        >
                                            下一页
                                        </Button>
                                    </Flex>
                                )}
                            </>
                        )}
                    </Box>
                </Stack>
            </Container>

            {/* 创建项目对话框 */}
            {showDialog && (
                <Box
                    position="fixed"
                    top={0}
                    left={0}
                    right={0}
                    bottom={0}
                    bg="blackAlpha.800"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    zIndex={1000}
                >
                    <Box bg="whiteAlpha.50" backdropFilter="blur(10px)" border="1px" borderColor="whiteAlpha.200" borderRadius="lg" p={8} maxW="md" w="full" mx={4}>
                        <Text fontSize="2xl" fontWeight="bold" color="white" mb={6}>
                            创建项目
                        </Text>

                        <Stack gap={4}>
                            <Box>
                                <Text fontSize="sm" fontWeight="medium" color="white" mb={2}>
                                    上传项目 JSON 文件
                                </Text>
                                <Input
                                    type="file"
                                    accept=".json"
                                    onChange={handleFileChange}
                                    bg="whiteAlpha.100"
                                    border="2px"
                                    borderColor="whiteAlpha.200"
                                    _hover={{ borderColor: 'blue.400' }}
                                    _focus={{ borderColor: 'blue.500', boxShadow: '0 0 0 1px var(--chakra-colors-blue-500)' }}
                                    color="white"
                                    py={2}
                                    px={3}
                                    css={{
                                        '&::file-selector-button': {
                                            bg: 'whiteAlpha.200',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: 'md',
                                            px: 4,
                                            py: 2,
                                            mr: 3,
                                            cursor: 'pointer',
                                            _hover: {
                                                bg: 'whiteAlpha.300',
                                            },
                                        },
                                    }}
                                />
                                {uploadedFile && (
                                    <Text fontSize="sm" color="gray.400" mt={2}>
                                        已选择: {uploadedFile.name}
                                    </Text>
                                )}
                            </Box>
                        </Stack>

                        <Flex gap={3} mt={6}>
                            <Button
                                colorPalette="blue"
                                flex={1}
                                onClick={handleCreateProject}
                                disabled={!uploadedFile || uploading}
                                loading={uploading}
                            >
                                创建
                            </Button>
                            <Button
                                bg="whiteAlpha.200"
                                color="white"
                                _hover={{ bg: 'whiteAlpha.300' }}
                                onClick={() => {
                                    setShowDialog(false);
                                    setUploadedFile(null);
                                }}
                                disabled={uploading}
                            >
                                取消
                            </Button>
                        </Flex>
                    </Box>
                </Box>
            )}
        </MainLayout>
    );
}
