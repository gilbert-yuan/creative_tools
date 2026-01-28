'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ProjectWithScenes, StoryboardScene, ProjectCharacter, CompositeVideo } from '@/types/project';
import { Image as ImageIcon, Film as FilmIcon, Sparkles, Save, History, Upload, FolderOpen } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MainLayout from '@/components/MainLayout';
import {
    Container,
    Box,
    Text,
    Stack,
    Flex,
    Button,
    Spinner,
    Center,
    SimpleGrid,
    Textarea,
    Image,
    DialogRoot,
    DialogBackdrop,
    DialogContent,
    DialogHeader,
    DialogBody,
    DialogFooter,
    DialogCloseTrigger,
    DialogTitle,
    DialogActionTrigger,
    Input,
    IconButton,
} from '@chakra-ui/react';
import { UploadDialog } from './UploadDialog';


export default function ProjectDetailPage() {
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const projectId = params.id as string;
    const tabParam = searchParams.get('tab') || 'script';

    const [currentTab, setCurrentTab] = useState(tabParam);
    const [projectData, setProjectData] = useState<ProjectWithScenes | null>(null);
    const [loading, setLoading] = useState(true);
    const [isEditingScript, setIsEditingScript] = useState(false);
    const [scriptContent, setScriptContent] = useState('');
    const [savingScript, setSavingScript] = useState(false);

    useEffect(() => {
        loadProjectData();
    }, [projectId]);

    const loadProjectData = async () => {
        try {
            const response = await fetch(`http://localhost:3001/api/projects/${projectId}`);
            const data = await response.json();
            setProjectData(data);
            if (data.project.script) {
                setScriptContent(data.project.script);
            }
        } catch (error) {
            console.error('加载项目失败:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleTabChange = (tab: string) => {
        setCurrentTab(tab);
        window.history.pushState({}, '', `?tab=${tab}`);
    };

    const handleSaveScript = async () => {
        setSavingScript(true);
        try {
            const response = await fetch(`http://localhost:3001/api/projects/${projectId}/script`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ script: scriptContent }),
            });
            if (response.ok) {
                setIsEditingScript(false);
                loadProjectData();
            } else {
                alert('保存失败');
            }
        } catch (error) {
            console.error('保存失败:', error);
            alert('保存失败');
        } finally {
            setSavingScript(false);
        }
    };

    if (loading) {
        return (
            <MainLayout>
                <Center minH="80vh">
                    <Stack align="center" gap={4}>
                        <Spinner size="xl" color="blue.500" />
                        <Text color="gray.400">加载中...</Text>
                    </Stack>
                </Center>
            </MainLayout>
        );
    }

    if (!projectData) {
        return (
            <MainLayout>
                <Center minH="80vh">
                    <Text color="gray.400">项目不存在</Text>
                </Center>
            </MainLayout>
        );
    }

    const projectType = projectData.project.project_type || 'video';
    const isComic = projectType === 'comic';
    const backUrl = isComic ? '/workspace/my-comics' : '/workspace/my-videos';
    const backText = isComic ? '我的漫画' : '我的短视频';
    const frameTabText = isComic ? '图绘制' : '首帧图绘制';

    return (
        <MainLayout>
            <Box
                bg="whiteAlpha.50"
                backdropFilter="blur(10px)"
                borderBottom="1px"
                borderColor="whiteAlpha.100"
                position="sticky"
                top={0}
                zIndex={10}
            >
                <Container maxW="7xl" py={3}>
                    <Flex justify="space-between" align="center">
                        {/* 自定义标签页 -左侧 */}
                        <Flex gap={4} align="center">
                            {/* 返回项目列表按钮 */}
                            <Link href={backUrl}>
                                <Button
                                    size="sm"
                                    bg="whiteAlpha.200"
                                    color="white"
                                    _hover={{ bg: 'whiteAlpha.300' }}
                                    fontWeight="medium"
                                >
                                    {backText}
                                </Button>
                            </Link>

                            {/* 分隔线 */}
                            <Box h="20px" w="1px" bg="whiteAlpha.300" />



                            <TabButton active={currentTab === 'script'} onClick={() => handleTabChange('script')}>
                                剧本
                            </TabButton>
                            <TabButton active={currentTab === 'global'} onClick={() => handleTabChange('global')}>
                                全局控制
                            </TabButton>
                            <TabButton active={currentTab === 'first-frame'} onClick={() => handleTabChange('first-frame')}>
                                {frameTabText}
                            </TabButton>
                            {!isComic && (
                                <TabButton active={currentTab === 'storyboard'} onClick={() => handleTabChange('storyboard')}>
                                    分镜生成
                                </TabButton>
                            )}
                            {!isComic && (
                                <TabButton active={currentTab === 'composite'} onClick={() => handleTabChange('composite')}>
                                    合成视频
                                </TabButton>
                            )}

                            {/* 分隔线 */}
                            <Box h="20px" w="1px" bg="whiteAlpha.300" />

                            <Link href={`/workspace/my-projects/${projectId}/canvas`}>
                                <Box
                                    as="button"
                                    py={2}
                                    px={4}
                                    fontSize="sm"
                                    fontWeight="medium"
                                    color="gray.400"
                                    bg="transparent"
                                    borderRadius="lg"
                                    cursor="pointer"
                                    transition="all 0.2s"
                                    _hover={{
                                        color: 'white',
                                        bg: 'whiteAlpha.100'
                                    }}
                                >
                                    画布
                                </Box>
                            </Link>
                        </Flex>

                        {/* 标题 - 右侧 */}
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
                </Container>
            </Box>

            {/* 内容区域 */}
            <Container maxW="7xl" py={6}>
                {/* 剧本页 */}
                {/* 剧本页 */}
                {currentTab === 'script' && (
                    <Box
                        bg="whiteAlpha.50"
                        backdropFilter="blur(10px)"
                        border="1px solid"
                        borderColor="whiteAlpha.100"
                        p={6}
                        borderRadius="lg"
                        color="white"
                    >
                        <Flex justify="flex-end" align="center" mb={4}>
                            {isEditingScript ? (
                                <Flex gap={2}>
                                    <Button
                                        size="sm"
                                        colorPalette="blue"
                                        onClick={handleSaveScript}
                                        loading={savingScript}
                                    >
                                        <Save size={16} />
                                        保存
                                    </Button>
                                    <Button
                                        size="sm"
                                        bg="whiteAlpha.200"
                                        color="white"
                                        _hover={{ bg: 'whiteAlpha.300' }}
                                        onClick={() => {
                                            setIsEditingScript(false);
                                            setScriptContent(projectData.project.script || '');
                                        }}
                                    >
                                        取消
                                    </Button>
                                </Flex>
                            ) : (
                                <Button
                                    size="sm"
                                    colorPalette="blue"
                                    variant="outline"
                                    onClick={() => setIsEditingScript(true)}
                                >
                                    编辑剧本
                                </Button>
                            )}
                        </Flex>

                        {isEditingScript ? (
                            <Textarea
                                value={scriptContent}
                                onChange={(e) => setScriptContent(e.target.value)}
                                minH="500px"
                                bg="blackAlpha.300"
                                border="1px solid"
                                borderColor="whiteAlpha.200"
                                _focus={{ borderColor: 'blue.500', boxShadow: '0 0 0 1px var(--chakra-colors-blue-500)' }}
                                p={4}
                                fontSize="md"
                                lineHeight="1.8"
                                placeholder="请输入剧本内容 (支持 Markdown)..."
                            />
                        ) : (
                            <Box
                                css={{
                                    '& h1': { fontSize: '1.75rem', fontWeight: 'bold', marginBottom: '0.75rem' },
                                    '& h2': { fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem', marginTop: '1rem' },
                                    '& p': { marginBottom: '0.75rem', lineHeight: '1.8' },
                                    '& ul, & ol': { marginBottom: '0.75rem', paddingLeft: '1.5rem' },
                                    '& li': { marginBottom: '0.25rem' },
                                    '& code': { backgroundColor: 'var(--chakra-colors-whiteAlpha-200)', padding: '0.125rem 0.25rem', borderRadius: '0.125rem' },
                                    '& pre': { backgroundColor: 'var(--chakra-colors-blackAlpha-300)', padding: '0.75rem', borderRadius: '0.375rem', overflow: 'auto', marginBottom: '0.75rem' },
                                }}
                            >
                                {projectData.project.script ? (
                                    <ReactMarkdown>{projectData.project.script}</ReactMarkdown>
                                ) : (
                                    <Text color="gray.400">暂无剧本内容，点击右上角编辑添加...</Text>
                                )}
                            </Box>
                        )}
                    </Box>
                )}

                {/* 全局控制页 */}
                {currentTab === 'global' && (
                    <GlobalControlTab
                        projectId={projectId}
                        projectType={projectType}
                        globalImagePrompt={projectData.project.global_image_prompt}
                        globalVideoPrompt={projectData.project.global_video_prompt}
                        combinedCharactersImage={projectData.project.combined_characters_image}
                        onUpdate={loadProjectData}
                    />
                )}

                {/* 首帧图绘制页 */}
                {currentTab === 'first-frame' && (
                    <MediaTab
                        scenes={projectData.scenes}
                        projectId={projectId}
                        type="image"
                        onUpdate={loadProjectData}
                    />
                )}

                {/* 分镜生成页 */}
                {currentTab === 'storyboard' && (
                    <MediaTab
                        scenes={projectData.scenes}
                        projectId={projectId}
                        type="video"
                        onUpdate={loadProjectData}
                    />
                )}


                {/* 合成视频页 */}
                {currentTab === 'composite' && (
                    <CompositeTab projectId={projectId} projectType={projectType} />
                )}
            </Container>
        </MainLayout>
    );
}

// 自定义标签页按钮组件
function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <Box
            as="button"
            py={2}
            px={4}
            fontSize="sm"
            fontWeight={active ? 'bold' : 'medium'}
            color={active ? 'white' : 'gray.400'}
            bg={active ? 'blue.600' : 'transparent'}
            borderRadius="lg"
            onClick={onClick}
            cursor="pointer"
            transition="all 0.2s"
            _hover={{
                color: 'white',
                bg: active ? 'blue.700' : 'whiteAlpha.100'
            }}
            boxShadow={active ? 'lg' : 'none'}
        >
            {children}
        </Box>
    );
}

// 全局控制标签页组件
function GlobalControlTab({
    projectId,
    projectType,
    globalImagePrompt,
    globalVideoPrompt,
    combinedCharactersImage,
    onUpdate,
}: {
    projectId: string;
    projectType?: string;
    globalImagePrompt: string | null;
    globalVideoPrompt: string | null;
    combinedCharactersImage: string | null;
    onUpdate: () => void;
}) {
    const isComic = projectType === 'comic';
    const imagePromptLabel = isComic ? '生成图的全局提示词' : '生成首帧图的全局提示词';
    const imagePromptPlaceholder = isComic ? '输入图全局提示词，将应用到所有图生成任务...' : '输入首帧图全局提示词，将应用到所有首帧图生成任务...';
    const videoPromptLabel = '生成视频的全局提示词';
    const [characters, setCharacters] = useState<ProjectCharacter[]>([]);
    const [globalImagePromptText, setGlobalImagePromptText] = useState(globalImagePrompt || '');
    const [globalVideoPromptText, setGlobalVideoPromptText] = useState(globalVideoPrompt || '');
    const [editingImagePrompt, setEditingImagePrompt] = useState(false);
    const [editingVideoPrompt, setEditingVideoPrompt] = useState(false);
    const [globalSaveStatus, setGlobalSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [loadingChars, setLoadingChars] = useState(true);
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
    const [stitchingImage, setStitchingImage] = useState(false);
    const [deletingCombinedImage, setDeletingCombinedImage] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false); const handleLinkCharacter = async (charId: string) => {
        try {
            const response = await fetch(`http://localhost:3001/api/projects/${projectId}/characters/link`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ char_id: charId }),
            });
            if (response.ok) {
                loadCharacters();
                setIsSearchModalOpen(false);
            }
        } catch (error) {
            console.error('Link failed:', error);
        }
    };

    useEffect(() => {
        loadCharacters();
    }, [projectId]);

    const loadCharacters = async () => {
        try {
            const response = await fetch(`http://localhost:3001/api/projects/${projectId}/characters`);
            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data)) {
                    setCharacters(data);
                } else {
                    console.error('Data format error: expected array', data);
                    setCharacters([]);
                }
            } else {
                console.error('Failed to load characters');
                setCharacters([]);
            }
        } catch (error) {
            console.error('加载角色失败:', error);
        } finally {
            setLoadingChars(false);
        }
    };

    const handleAddCharacter = async () => {
        setIsSearchModalOpen(true);
    };

    const handleDeleteCharacter = async (charId: string) => {
        if (!confirm('确定将此角色从项目中移除？（不会删除全局角色）')) return;
        try {
            const response = await fetch(`http://localhost:3001/api/projects/${projectId}/characters/${charId}`, {
                method: 'DELETE',
            });
            if (response.ok) {
                loadCharacters();
                onUpdate(); // 刷新项目数据，拼接图已被清除
            }
        } catch (error) {
            console.error('删除失败:', error);
        }
    };

    const handleStitchCharacters = async () => {
        setStitchingImage(true);
        try {
            const response = await fetch(`http://localhost:3001/api/projects/${projectId}/stitch-characters`, {
                method: 'POST',
            });
            if (response.ok) {
                const data = await response.json();
                console.log('拼接成功:', data);
                onUpdate(); // 刷新项目数据以获取新的拼接图URL
            } else {
                const errorData = await response.json();
                alert(`拼接失败: ${errorData.error || '未知错误'}`);
            }
        } catch (error) {
            console.error('拼接失败:', error);
            alert('拼接失败，请重试');
        } finally {
            setStitchingImage(false);
        }
    };

    const handleDeleteCombinedImage = async () => {
        if (!confirm('确定删除拼接的角色图？')) return;
        setDeletingCombinedImage(true);
        try {
            const response = await fetch(`http://localhost:3001/api/projects/${projectId}/combined-characters`, {
                method: 'DELETE',
            });
            if (response.ok) {
                onUpdate(); // 刷新项目数据
            } else {
                alert('删除失败');
            }
        } catch (error) {
            console.error('删除失败:', error);
            alert('删除失败，请重试');
        } finally {
            setDeletingCombinedImage(false);
        }
    };

    const handleSaveGlobalPrompts = async () => {
        setGlobalSaveStatus('saving');
        try {
            const response = await fetch(`http://localhost:3001/api/projects/${projectId}/global-prompt`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    global_image_prompt: globalImagePromptText,
                    global_video_prompt: globalVideoPromptText
                }),
            });
            if (response.ok) {
                setGlobalSaveStatus('saved');
                setEditingImagePrompt(false);
                setEditingVideoPrompt(false);
                onUpdate();
            } else {
                setGlobalSaveStatus('idle');
            }
        } catch (error) {
            console.error('保存全局提示词失败:', error);
            setGlobalSaveStatus('idle');
        }
    };

    const getImageUrl = (url: string | null) => {
        if (!url) return '';
        if (url.startsWith('http')) return url;
        return `http://localhost:3001${url}`;
    };

    return (
        <Stack gap={6}>
            {/* 生成首帧图的全局提示词 */}
            <Box bg="whiteAlpha.50" backdropFilter="blur(10px)" border="1px solid" borderColor="whiteAlpha.100" borderRadius="lg" p={4}>
                <Text fontSize="md" fontWeight="semibold" color="white" mb={3}>
                    {imagePromptLabel}
                </Text>
                {editingImagePrompt ? (
                    <>
                        <Textarea
                            autoFocus
                            value={globalImagePromptText}
                            onChange={(e) => {
                                setGlobalImagePromptText(e.target.value);
                                if (globalSaveStatus === 'saved') {
                                    setGlobalSaveStatus('idle');
                                }
                            }}
                            bg="blackAlpha.300"
                            border="2px"
                            borderColor="whiteAlpha.200"
                            _hover={{ borderColor: 'whiteAlpha.300' }}
                            _focus={{ borderColor: 'blue.500', boxShadow: '0 0 0 1px var(--chakra-colors-blue-500)' }}
                            color="white"
                            minH="120px"
                            fontSize="sm"
                            placeholder={imagePromptPlaceholder}
                        />
                        <Flex gap={2} mt={3}>
                            <Button
                                size="sm"
                                colorPalette={globalSaveStatus === 'saved' ? 'gray' : 'blue'}
                                onClick={handleSaveGlobalPrompts}
                                loading={globalSaveStatus === 'saving'}
                            >
                                <Save size={16} />
                                {globalSaveStatus === 'saved' ? '已保存' : '保存'}
                            </Button>
                            <Button size="sm" bg="whiteAlpha.200" color="white" _hover={{ bg: 'whiteAlpha.300' }} onClick={() => setEditingImagePrompt(false)}>
                                取消
                            </Button>
                        </Flex>
                    </>
                ) : (
                    <Box
                        bg="blackAlpha.300"
                        border="2px"
                        borderColor="whiteAlpha.200"
                        borderRadius="md"
                        p={3}
                        minH="120px"
                        cursor="pointer"
                        _hover={{ borderColor: 'whiteAlpha.300' }}
                        onClick={() => {
                            setEditingImagePrompt(true);
                            setGlobalSaveStatus('idle');
                        }}
                    >
                        <Text fontSize="sm" color={globalImagePromptText ? 'white' : 'whiteAlpha.500'}>
                            {globalImagePromptText || `点击编辑${isComic ? '图' : '首帧图'}全局提示词...`}
                        </Text>
                    </Box>
                )}
            </Box>


            {/* 生成视频的全局提示词 - 只在视频项目显示 */}
            {!isComic && (
                <Box bg="whiteAlpha.50" backdropFilter="blur(10px)" border="1px solid" borderColor="whiteAlpha.100" borderRadius="lg" p={4}>
                    <Text fontSize="md" fontWeight="semibold" color="white" mb={3}>
                        生成视频的全局提示词
                    </Text>
                    {editingVideoPrompt ? (
                        <>
                            <Textarea
                                autoFocus
                                value={globalVideoPromptText}
                                onChange={(e) => {
                                    setGlobalVideoPromptText(e.target.value);
                                    if (globalSaveStatus === 'saved') {
                                        setGlobalSaveStatus('idle');
                                    }
                                }}
                                bg="blackAlpha.300"
                                border="2px"
                                borderColor="whiteAlpha.200"
                                _hover={{ borderColor: 'whiteAlpha.300' }}
                                _focus={{ borderColor: 'blue.500', boxShadow: '0 0 0 1px var(--chakra-colors-blue-500)' }}
                                color="white"
                                minH="120px"
                                fontSize="sm"
                                placeholder="输入视频全局提示词，将应用到所有视频生成任务..."
                            />
                            <Flex gap={2} mt={3}>
                                <Button
                                    size="sm"
                                    colorPalette={globalSaveStatus === 'saved' ? 'gray' : 'blue'}
                                    onClick={handleSaveGlobalPrompts}
                                    loading={globalSaveStatus === 'saving'}
                                >
                                    <Save size={16} />
                                    {globalSaveStatus === 'saved' ? '已保存' : '保存'}
                                </Button>
                                <Button size="sm" bg="whiteAlpha.200" color="white" _hover={{ bg: 'whiteAlpha.300' }} onClick={() => setEditingVideoPrompt(false)}>
                                    取消
                                </Button>
                            </Flex>
                        </>
                    ) : (
                        <Box
                            bg="blackAlpha.300"
                            border="2px"
                            borderColor="whiteAlpha.200"
                            borderRadius="md"
                            p={3}
                            minH="120px"
                            cursor="pointer"
                            _hover={{ borderColor: 'whiteAlpha.300' }}
                            onClick={() => {
                                setEditingVideoPrompt(true);
                                setGlobalSaveStatus('idle');
                            }}
                        >
                            <Text fontSize="sm" color={globalVideoPromptText ? 'white' : 'whiteAlpha.500'}>
                                {globalVideoPromptText || '点击编辑视频全局提示词...'}
                            </Text>
                        </Box>
                    )}
                </Box>
            )}

            {/* 拼接角色图区域 */}
            <Box bg="whiteAlpha.50" backdropFilter="blur(10px)" border="1px solid" borderColor="whiteAlpha.100" borderRadius="lg" p={4}>
                <Flex justify="space-between" align="center" mb={3}>
                    <Text fontSize="md" fontWeight="semibold" color="white">
                        拼接角色图
                    </Text>
                    <Flex gap={2}>
                        {combinedCharactersImage && (
                            <Button
                                size="sm"
                                colorPalette="red"
                                variant="outline"
                                onClick={handleDeleteCombinedImage}
                                loading={deletingCombinedImage}
                            >
                                删除拼接图
                            </Button>
                        )}
                        <Button
                            size="sm"
                            colorPalette="blue"
                            onClick={handleStitchCharacters}
                            loading={stitchingImage}
                            disabled={characters.length === 0}
                        >
                            {combinedCharactersImage ? '重新拼接' : '拼接角色图'}
                        </Button>
                    </Flex>
                </Flex>

                {combinedCharactersImage ? (
                    <Box>
                        <Text fontSize="sm" color="gray.400" mb={2}>
                            拼接后的角色图将在生成视频时自动使用
                        </Text>
                        <Image
                            src={getImageUrl(combinedCharactersImage)}
                            alt="拼接角色图"
                            maxW="600px"
                            borderRadius="lg"
                            border="1px solid"
                            borderColor="whiteAlpha.200"
                            cursor="pointer"
                            _hover={{ opacity: 0.8, borderColor: 'blue.400' }}
                            transition="all 0.2s"
                            onClick={() => {
                                setPreviewImage(getImageUrl(combinedCharactersImage));
                                setIsPreviewOpen(true);
                            }}
                        />
                    </Box>
                ) : (
                    <Center py={8} bg="blackAlpha.300" borderRadius="md">
                        <Stack align="center" gap={2}>
                            <Text color="gray.400" fontSize="sm">
                                {characters.length === 0
                                    ? '请先添加角色，然后点击"拼接角色图"'
                                    : '点击"拼接角色图"按钮将所有角色图片拼接成一张图'}
                            </Text>
                            <Text color="gray.500" fontSize="xs">
                                拼接后的图片将在视频生成时使用
                            </Text>
                        </Stack>
                    </Center>
                )}
            </Box>

            {/* 角色列表 */}
            <Box>
                <Flex justify="space-between" align="center" mb={4}>
                    <Text fontSize="md" fontWeight="semibold" color="white">
                        角色管理
                    </Text>
                    <Flex gap={3}>
                        <Link href="/workspace/characters" target="_blank">
                            <Button size="sm" variant="outline" color="white" _hover={{ bg: 'whiteAlpha.200' }}>
                                维护角色库
                            </Button>
                        </Link>
                        <Button size="sm" colorPalette="blue" onClick={handleAddCharacter}>
                            + 添加角色
                        </Button>
                    </Flex>
                </Flex>

                {loadingChars ? (
                    <Center py={10}>
                        <Spinner size="lg" color="blue.500" />
                    </Center>
                ) : characters.length === 0 ? (
                    <Box
                        bg="whiteAlpha.50"
                        backdropFilter="blur(10px)"
                        border="1px solid"
                        borderColor="whiteAlpha.100"
                        borderRadius="lg"
                        p={8}
                        textAlign="center"
                    >
                        <Text color="gray.400" fontSize="md" mb={4}>
                            当前项目还没有添加角色
                        </Text>
                        <Text color="gray.500" fontSize="sm" mb={6}>
                            您可以从角色库添加已有角色，或创建新角色
                        </Text>
                        <Flex gap={3} justify="center">
                            <Link href="/workspace/characters?tab=pending" target="_blank">
                                <Button size="sm" colorPalette="yellow" variant="outline">
                                    查看待生成角色
                                </Button>
                            </Link>
                            <Link href="/workspace/characters" target="_blank">
                                <Button size="sm" colorPalette="blue" variant="outline">
                                    前往角色库
                                </Button>
                            </Link>
                            <Button size="sm" colorPalette="blue" onClick={handleAddCharacter}>
                                添加角色
                            </Button>
                        </Flex>
                    </Box>
                ) : (
                    <Stack gap={4}>
                        {characters.map((char) => (
                            <Box key={char.id} bg="whiteAlpha.50" backdropFilter="blur(10px)" border="1px solid" borderColor="whiteAlpha.100" borderRadius="lg" p={6}>
                                <Flex gap={6} align="start">
                                    <Box w="50%" flexShrink={0}>
                                        {char.image_url ? (
                                            <Image
                                                src={getImageUrl(char.image_url)}
                                                alt={char.name}
                                                w="100%"
                                                h="auto"
                                                objectFit="cover"
                                                borderRadius="lg"
                                                cursor="pointer"
                                                _hover={{ opacity: 0.8, borderColor: 'blue.400' }}
                                                transition="all 0.2s"
                                                border="1px solid"
                                                borderColor="whiteAlpha.200"
                                                onClick={() => {
                                                    setPreviewImage(getImageUrl(char.image_url!));
                                                    setIsPreviewOpen(true);
                                                }}
                                            />
                                        ) : (
                                            <Center
                                                w="100%"
                                                h="auto"
                                                bg="blackAlpha.300"
                                                borderRadius="lg"
                                                aspectRatio="9/16"
                                            >
                                                <Text fontSize="xs" color="whiteAlpha.500">无图</Text>
                                            </Center>
                                        )}
                                    </Box>

                                    <Box flex={1}>
                                        <Stack gap={1} h="100%">
                                            <Flex justify="space-between" align="start">
                                                <Text fontSize="xl" fontWeight="bold" color="white">
                                                    {char.name}
                                                </Text>
                                                {char.category && (
                                                    <Box bg="blue.900" px={3} py={1} borderRadius="md">
                                                        <Text fontSize="sm" color="blue.200">{char.category}</Text>
                                                    </Box>
                                                )}
                                            </Flex>

                                            <Flex gap={1} flexWrap="wrap">
                                                {char.tags && char.tags.map((tag, idx) => (
                                                    <Box key={idx} bg="whiteAlpha.200" px={1.5} py={0.5} borderRadius="sm">
                                                        <Text fontSize="10px" color="whiteAlpha.800">#{tag}</Text>
                                                    </Box>
                                                ))}
                                            </Flex>

                                            <Box mt={2}>
                                                <Text fontSize="xs" fontWeight="semibold" color="gray.400" mb={2}>
                                                    提示词：
                                                </Text>
                                                <Text
                                                    fontSize="sm"
                                                    color="gray.300"
                                                    lineHeight="1.8"
                                                    whiteSpace="pre-wrap"
                                                >
                                                    {char.prompt || '无提示词'}
                                                </Text>
                                            </Box>
                                            <Flex gap={2} mt={3}>
                                                <Button
                                                    size="sm"
                                                    colorPalette="red"
                                                    onClick={() => handleDeleteCharacter(char.id)}
                                                    _hover={{ bg: 'red.600' }}
                                                >
                                                    移除角色
                                                </Button>
                                            </Flex>
                                        </Stack>
                                    </Box>
                                </Flex>
                            </Box>
                        ))}
                    </Stack>
                )}
            </Box >

            {/* 图片预览模态框 */}
            <DialogRoot
                open={isPreviewOpen}
                onOpenChange={(e) => setIsPreviewOpen(e.open)}
                size="xl"
            >
                <DialogBackdrop bg="blackAlpha.800" />
                <DialogContent
                    bg="transparent"
                    boxShadow="none"
                    maxW="90vw"
                    maxH="90vh"
                    position="fixed"
                    top="50%"
                    left="50%"
                    transform="translate(-50%, -50%)"
                    p={0}
                >
                    <DialogBody p={0}>
                        <Center>
                            {previewImage && (
                                <Image
                                    src={previewImage}
                                    alt="预览"
                                    maxH="90vh"
                                    objectFit="contain"
                                    borderRadius="md"
                                />
                            )}
                        </Center>
                    </DialogBody>
                </DialogContent>
            </DialogRoot>

            <SearchCharacterModal
                isOpen={isSearchModalOpen}
                onClose={() => setIsSearchModalOpen(false)}
                onSelect={handleLinkCharacter}
                getImageUrl={getImageUrl}
            />
        </Stack >
    );
}

// 搜索角色弹窗组件
function SearchCharacterModal({
    isOpen,
    onClose,
    onSelect,
    getImageUrl
}: {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (charId: string) => void;
    getImageUrl: (url: string) => string;
}) {
    const [keyword, setKeyword] = useState('');
    const [candidates, setCandidates] = useState<any[]>([]); // Using any for SystemCharacter structure for now
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        if (isOpen) {
            // 重置状态，不自动加载
            setKeyword('');
            setCandidates([]);
        }
    }, [isOpen]);

    const handleSearch = async (query: string) => {
        // 如果搜索框为空，不加载任何角色
        if (!query.trim()) {
            setCandidates([]);
            return;
        }

        setSearching(true);
        try {
            const response = await fetch(`http://localhost:3001/api/system-characters?query=${encodeURIComponent(query)}&limit=3`);
            if (response.ok) {
                const data = await response.json();
                setCandidates(data);
            }
        } catch (error) {
            console.error('搜索失败:', error);
        } finally {
            setSearching(false);
        }
    };

    return (
        <DialogRoot
            open={isOpen}
            onOpenChange={(e) => !e.open && onClose()}
            size="lg"
        >
            <DialogBackdrop />
            <DialogContent
                bg="whiteAlpha.100"
                backdropFilter="blur(20px)"
                border="1px solid"
                borderColor="whiteAlpha.200"
                color="white"
                maxH="80vh"
                position="fixed"
                top="50%"
                left="50%"
                transform="translate(-50%, -50%)"
                overflowY="auto"
            >
                <DialogHeader>
                    <DialogTitle>添加角色到项目</DialogTitle>
                    <DialogCloseTrigger />
                </DialogHeader>
                <DialogBody pb={6}>
                    <Stack gap={4}>
                        <Input
                            placeholder="搜索角色名称或ID... (最多显示3个结果)"
                            bg="whiteAlpha.100"
                            border="none"
                            color="white"
                            _focus={{ bg: 'whiteAlpha.200', ring: 1, ringColor: 'blue.500' }}
                            value={keyword}
                            onChange={(e) => {
                                setKeyword(e.target.value);
                                handleSearch(e.target.value);
                            }}
                        />

                        {searching ? (
                            <Center py={8}><Spinner /></Center>
                        ) : !keyword.trim() ? (
                            <Center py={8}>
                                <Stack align="center" gap={2}>
                                    <Text color="gray.400" fontSize="sm">请输入角色名称或ID进行搜索</Text>
                                    <Text color="gray.500" fontSize="xs">提示：在角色库可以复制角色ID</Text>
                                </Stack>
                            </Center>
                        ) : candidates.length === 0 ? (
                            <Center py={8}><Text color="gray.500">未找到相关角色</Text></Center>
                        ) : (
                            <SimpleGrid columns={3} gap={4} maxH="400px" overflowY="auto" pr={1}>
                                {candidates.map(char => (
                                    <Box
                                        key={char.id}
                                        bg="whiteAlpha.50"
                                        borderRadius="md"
                                        p={2}
                                        cursor="pointer"
                                        _hover={{ bg: 'whiteAlpha.100', ring: 1, ringColor: 'blue.500' }}
                                        onClick={() => onSelect(char.id)}
                                    >
                                        {char.image_url ? (
                                            <Image
                                                src={getImageUrl(char.image_url)}
                                                alt={char.name}
                                                borderRadius="md"
                                                mb={2}
                                                aspectRatio="9/16"
                                                objectFit="cover"
                                                bg="gray.800"
                                            />
                                        ) : (
                                            <Center
                                                borderRadius="md"
                                                mb={2}
                                                aspectRatio="9/16"
                                                bg="gray.600"
                                            >
                                                <Text fontSize="xs" color="gray.400">无图</Text>
                                            </Center>
                                        )}
                                        <Text fontSize="sm" fontWeight="bold" lineClamp={1}>{char.name}</Text>
                                        <Text fontSize="xs" color="gray.400" lineClamp={2}>{char.prompt}</Text>
                                    </Box>
                                ))}
                            </SimpleGrid>
                        )}
                    </Stack>
                </DialogBody>
            </DialogContent>
        </DialogRoot>
    );
}

// localStorage helpers for generation state persistence
const GENERATING_STORAGE_KEY = 'vt_generating_scenes';

interface GeneratingState {
    sceneId: number;
    type: string;
    startTime: number;
}

// Changed to support multiple scenes generating simultaneously
const saveGeneratingState = (sceneId: number, type: string) => {
    const stored = localStorage.getItem(GENERATING_STORAGE_KEY);
    const states: Record<string, GeneratingState> = stored ? JSON.parse(stored) : {};
    const key = `${sceneId}-${type}`;
    states[key] = { sceneId, type, startTime: Date.now() };
    localStorage.setItem(GENERATING_STORAGE_KEY, JSON.stringify(states));
};

const clearGeneratingState = (sceneId: number, type: string) => {
    const stored = localStorage.getItem(GENERATING_STORAGE_KEY);
    if (!stored) return;
    try {
        const states: Record<string, GeneratingState> = JSON.parse(stored);
        const key = `${sceneId}-${type}`;
        delete states[key];
        if (Object.keys(states).length === 0) {
            localStorage.removeItem(GENERATING_STORAGE_KEY);
        } else {
            localStorage.setItem(GENERATING_STORAGE_KEY, JSON.stringify(states));
        }
    } catch {
        localStorage.removeItem(GENERATING_STORAGE_KEY);
    }
};

const loadGeneratingStates = (type: string): Map<number, number> => {
    const stored = localStorage.getItem(GENERATING_STORAGE_KEY);
    if (!stored) return new Map();

    try {
        const states: Record<string, GeneratingState> = JSON.parse(stored);
        const result = new Map<number, number>();
        const now = Date.now();

        // 根据类型确定超时时间：图片180秒，视频300秒
        const timeoutDuration = type === 'image' ? 180000 : 300000;

        Object.entries(states).forEach(([key, state]) => {
            if (state.type === type) {
                // 检查是否超时
                if (now - state.startTime <= timeoutDuration) {
                    result.set(state.sceneId, state.startTime);
                } else {
                    // 清除过期状态
                    clearGeneratingState(state.sceneId, state.type);
                }
            }
        });

        return result;
    } catch {
        localStorage.removeItem(GENERATING_STORAGE_KEY);
        return new Map();
    }
};

function MediaTab({
    scenes,
    projectId,
    type,
    onUpdate,
}: {
    scenes: StoryboardScene[];
    projectId: string;
    type: 'image' | 'video';
    onUpdate: () => void;
}) {
    const router = useRouter();
    const [editingSceneId, setEditingSceneId] = useState<number | null>(null);
    const [editPrompt, setEditPrompt] = useState('');
    const [editDuration, setEditDuration] = useState('');
    const [generating, setGenerating] = useState<Set<number>>(new Set());
    // 存储每个场景的生成状态和进度
    const [generationStatus, setGenerationStatus] = useState<Map<number, { status: string; progress: number }>>(new Map());

    // 媒体文件时间戳管理（用于控制缓存刷新）
    const [mediaTimestamps, setMediaTimestamps] = useState<Record<number, number>>({});
    const initialTimestamp = useRef(Date.now());

    // 上传相关状态 - 仅保留控制对话框的最小状态
    const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
    const [uploadingSceneId, setUploadingSceneId] = useState<number | null>(null);

    const handleOpenUpload = (sceneId: number) => {
        setUploadingSceneId(sceneId);
        setUploadDialogOpen(true);
    };

    const handleCloseUpload = () => {
        setUploadDialogOpen(false);
        setUploadingSceneId(null);
    };

    const isImage = type === 'image';
    const promptField = isImage ? 'first_frame_prompt' : 'video_prompt';
    const latestUrlField = isImage ? 'latest_image_url' : 'latest_video_url';

    // 使用 useMemo 缓存 URL，避免每次渲染都刷新视频
    const mediaUrls = useMemo(() => {
        const urls: Record<string, string> = {};
        // 默认使用初始时间戳，只有当 mediaTimestamps 中有特定 update 时才使用新时间戳

        scenes.forEach(scene => {
            // Unify URL handling
            const getFullUrl = (url: string) => url.startsWith('http') ? url : `http://localhost:3001${url}`;
            // 获取该场景的时间戳，如果没有特定更新，则使用初始加载时间戳
            const ts = mediaTimestamps[scene.id] || initialTimestamp.current;

            // Main URL
            const mainUrl = scene[latestUrlField];
            if (mainUrl) {
                urls[`${scene.id}_main`] = `${getFullUrl(mainUrl)}?t=${ts}`;
            }

            // Poster URL (always latest_image_url for videos)
            const posterUrl = scene.latest_image_url;
            if (posterUrl) {
                urls[`${scene.id}_poster`] = `${getFullUrl(posterUrl)}?t=${ts}`;
            }
        });
        return urls;
    }, [scenes, latestUrlField, mediaTimestamps]);

    // 恢复生成状态（页面加载时）
    useEffect(() => {
        const states = loadGeneratingStates(type);
        const timeoutIds: NodeJS.Timeout[] = [];

        // 根据类型确定超时时间
        const timeoutDuration = isImage ? 180000 : 300000;

        if (states.size > 0) {
            setGenerating(new Set(states.keys()));

            states.forEach((startTime, sceneId) => {
                // 计算剩余时间并设置超时
                const elapsed = Date.now() - startTime;
                const remaining = timeoutDuration - elapsed;

                if (remaining > 0) {
                    const timeoutId = setTimeout(() => {
                        setGenerating(prev => {
                            const next = new Set(prev);
                            next.delete(sceneId);
                            return next;
                        });
                        clearGeneratingState(sceneId, type);
                        alert(`${isImage ? '首帧图' : '视频'}生成超时，请重试`);
                    }, remaining);
                    timeoutIds.push(timeoutId);
                } else {
                    // 已经超时，直接清除
                    setGenerating(prev => {
                        const next = new Set(prev);
                        next.delete(sceneId);
                        return next;
                    });
                    clearGeneratingState(sceneId, type);
                }
            });
        }

        return () => timeoutIds.forEach(id => clearTimeout(id));
    }, [type, isImage]);

    const handleEdit = (scene: StoryboardScene) => {
        setEditingSceneId(scene.id);
        setEditPrompt(scene[promptField] || '');
        setEditDuration((scene.duration || 8).toString());
    };

    const handleSave = async (sceneId: number) => {
        try {
            const scene = scenes.find(s => s.id === sceneId);
            const duration = parseFloat(editDuration);

            // 验证时长
            if (isNaN(duration) || duration < 1 || duration > 30) {
                alert('时长必须在1-30秒之间');
                return;
            }

            const response = await fetch(
                `http://localhost:3001/api/projects/${projectId}/scenes/${sceneId}`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        first_frame_prompt: isImage ? editPrompt : (scene?.first_frame_prompt || ''),
                        video_prompt: isImage ? (scene?.video_prompt || '') : editPrompt,
                        duration: isImage ? scene?.duration : duration,
                    }),
                }
            );
            if (response.ok) {
                setEditingSceneId(null);
                setEditDuration('');
                onUpdate();
            }
        } catch (error) {
            console.error('保存失败:', error);
            alert('保存失败');
        }
    };

    const handleGenerate = async (sceneId: number) => {
        setGenerating(prev => new Set(prev).add(sceneId));
        // 初始化状态显示
        setGenerationStatus(prev => {
            const next = new Map(prev);
            next.set(sceneId, { status: 'initializing', progress: 0 });
            return next;
        });
        saveGeneratingState(sceneId, type);

        // 视频生成超时：5分钟（300秒）
        // 图片生成超时：3分钟（180秒）
        const timeoutDuration = isImage ? 180000 : 300000;
        const timeoutId = setTimeout(() => {
            setGenerating(prev => {
                const next = new Set(prev);
                next.delete(sceneId);
                return next;
            });
            clearGeneratingState(sceneId, type);
            alert(`${isImage ? '首帧图' : '视频'}生成超时，请重试`);
        }, timeoutDuration);

        try {
            const endpoint = isImage ? 'generate-image' : 'generate-video';
            const response = await fetch(
                `http://localhost:3001/api/projects/${projectId}/scenes/${sceneId}/${endpoint}`,
                { method: 'POST' }
            );

            if (response.ok) {
                const data = await response.json();

                if (isImage) {
                    // 图片生成：直接完成
                    console.log(`✅ 首帧图生成成功:`, data);
                    clearTimeout(timeoutId);
                    setGenerating(prev => {
                        const next = new Set(prev);
                        next.delete(sceneId);
                        return next;
                    });
                    clearGeneratingState(sceneId, type);
                    onUpdate();
                } else {
                    // 视频生成：启动轮询
                    const videoId = data.video_id;
                    console.log(`✅ 视频生成已启动，Video ID: ${videoId}`);

                    // 开始轮询视频状态
                    pollVideoStatus(sceneId, videoId, timeoutId);
                }
            } else {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error || errorData.message || `生成失败: ${response.statusText}`;
                console.error(`❌ ${isImage ? '首帧图' : '视频'}生成失败:`, errorMessage);
                alert(`生成失败: ${errorMessage}`);
                clearTimeout(timeoutId);
                setGenerating(prev => {
                    const next = new Set(prev);
                    next.delete(sceneId);
                    return next;
                });
                clearGeneratingState(sceneId, type);
            }
        } catch (error) {
            console.error(`❌ ${isImage ? '首帧图' : '视频'}生成异常:`, error);
            alert(`生成失败: ${error instanceof Error ? error.message : '网络错误或服务器异常'}`);
            clearTimeout(timeoutId);
            setGenerating(prev => {
                const next = new Set(prev);
                next.delete(sceneId);
                return next;
            });
            clearGeneratingState(sceneId, type);
        }
    };

    // 轮询视频生成状态
    const pollVideoStatus = async (sceneId: number, videoId: string, timeoutId: NodeJS.Timeout) => {
        const pollInterval = 5000; // 5秒轮询一次
        const initialDelay = 60000; // 1分钟后开始轮询
        let attempts = 0;
        const maxAttempts = 60; // 最多轮询60次（5分钟）

        const poll = async () => {
            attempts++;
            if (attempts > maxAttempts) {
                console.error('❌ 轮询超时');
                clearTimeout(timeoutId);
                setGenerating(prev => {
                    const next = new Set(prev);
                    next.delete(sceneId);
                    return next;
                });
                clearGeneratingState(sceneId, type);
                alert('视频生成超时，请重试');
                return;
            }

            try {
                const response = await fetch(
                    `http://localhost:3001/api/projects/${projectId}/scenes/${sceneId}/video-status/${videoId}`
                );

                if (response.ok) {
                    const data = await response.json();
                    console.log(`📡 轮询第 ${attempts} 次，状态: ${data.status} (${data.progress}%)`);

                    // 更新状态显示
                    setGenerationStatus(prev => {
                        const next = new Map(prev);
                        next.set(sceneId, { status: data.status, progress: data.progress || 0 });
                        return next;
                    });

                    if (data.status === 'completed') {
                        // 视频生成完成
                        console.log('🎉 视频生成完成！', data.video_url);
                        clearTimeout(timeoutId);
                        setGenerating(prev => {
                            const next = new Set(prev);
                            next.delete(sceneId);
                            return next;
                        });
                        setGenerationStatus(prev => {
                            const next = new Map(prev);
                            next.delete(sceneId);
                            return next;
                        });
                        clearGeneratingState(sceneId, type);
                        onUpdate(); // 刷新场景数据，加载新视频
                    } else if (data.status === 'failed' || data.status === 'error') {
                        // 视频生成失败
                        console.error('❌ 视频生成失败:', data.error);
                        clearTimeout(timeoutId);
                        setGenerating(prev => {
                            const next = new Set(prev);
                            next.delete(sceneId);
                            return next;
                        });
                        clearGeneratingState(sceneId, type);
                        alert(`视频生成失败: ${data.error || '未知错误'}`);
                    } else {
                        // 继续轮询 (queued, processing 等状态)
                        setTimeout(poll, pollInterval);
                    }
                } else {
                    console.error('❌ 轮询请求失败:', response.statusText);
                    // 继续轮询，可能是临时网络问题
                    setTimeout(poll, pollInterval);
                }
            } catch (error) {
                console.error('❌ 轮询异常:', error);
                // 继续轮询，可能是临时网络问题
                setTimeout(poll, pollInterval);
            }
        };

        // 1分钟后开始轮询
        console.log('⏳ 视频正在生成中，1分钟后开始检查状态...');
        setTimeout(poll, initialDelay);
    };

    const handleGoToHistory = (scene: StoryboardScene) => {
        router.push(`/workspace/my-projects/${projectId}/history/${scene.id}?type=${type}&scene=${scene.scene_index}`);
    };





    // 在Finder中显示文件
    const handleRevealInFinder = async (url: string) => {
        try {
            const response = await fetch('http://localhost:3001/api/files/reveal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_path: url }),
            });

            if (!response.ok) {
                const error = await response.json();
                alert(`打开失败: ${error.error || '未知错误'}`);
            }
        } catch (error) {
            console.error('打开Finder失败:', error);
            alert('打开Finder失败，请重试');
        }
    };

    return (
        <Stack gap={4}>
            {scenes.map((scene) => (
                <Box key={scene.id} bg="whiteAlpha.50" backdropFilter="blur(10px)" border="1px solid" borderColor="whiteAlpha.100" borderRadius="lg" p={4}>
                    <Flex justify="space-between" align="center" mb={3}>
                        <Text fontSize="md" fontWeight="semibold" color="white">
                            分镜 #{scene.scene_index}
                        </Text>
                        {scene.start_time && scene.end_time && (
                            <Text fontSize="xs" color="whiteAlpha.600">
                                {scene.start_time} - {scene.end_time}
                                {scene.duration && <span style={{ marginLeft: '0.5rem' }}>| {scene.duration.toFixed(1)}s</span>}
                            </Text>
                        )}
                    </Flex>

                    <Flex gap={6} flexDirection={{ base: 'column', md: 'row' }}>
                        <Box w={{ base: '100%', md: '280px' }} flexShrink={0}>
                            <Box
                                bg="blackAlpha.300"
                                borderRadius="lg"
                                position="relative"
                                style={{ aspectRatio: '9/16' }}
                                overflow="hidden"
                                border="1px solid"
                                borderColor="whiteAlpha.200"
                            >
                                {scene[latestUrlField] ? (
                                    isImage ? (
                                        <Image
                                            key={scene[latestUrlField] || 'no-image'}
                                            src={mediaUrls[`${scene.id}_main`] || ''}
                                            alt={`Scene ${scene.scene_index}`}
                                            w="100%"
                                            h="100%"
                                            objectFit="cover"
                                        />
                                    ) : (
                                        <video
                                            key={scene[latestUrlField] || 'no-video'}
                                            src={mediaUrls[`${scene.id}_main`] || ''}
                                            poster={mediaUrls[`${scene.id}_poster`] || undefined}
                                            controls
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                    )
                                ) : !isImage && scene.latest_image_url ? (
                                    // 视频tab中，如果没有视频但有首帧图，显示首帧图并添加遮罩
                                    <>
                                        <Image
                                            src={mediaUrls[`${scene.id}_poster`] || ''}
                                            alt={`Scene ${scene.scene_index} First Frame`}
                                            w="100%"
                                            h="100%"
                                            objectFit="cover"
                                        />
                                        {/* 半透明遮罩层 */}
                                        <Box
                                            position="absolute"
                                            top={0}
                                            left={0}
                                            right={0}
                                            bottom={0}
                                            bg="blackAlpha.600"
                                            backdropFilter="blur(4px)"
                                            display="flex"
                                            alignItems="center"
                                            justifyContent="center"
                                        >
                                            <Stack align="center" gap={2}>
                                                <FilmIcon size={32} color="rgba(255, 255, 255, 0.6)" />
                                                <Text fontSize="sm" color="whiteAlpha.700" fontWeight="medium">
                                                    尚未生成视频
                                                </Text>
                                                <Text fontSize="xs" color="whiteAlpha.500">
                                                    已有首帧图
                                                </Text>
                                            </Stack>
                                        </Box>
                                    </>
                                ) : (
                                    <Center h="100%" bg="transparent" color="whiteAlpha.400">
                                        {isImage ? <ImageIcon size={24} /> : <FilmIcon size={24} />}
                                    </Center>
                                )}
                            </Box>
                        </Box>



                        <Stack gap={3} flex={1}>
                            {/* 时长信息和编辑区域 */}
                            {!isImage && (
                                <Box
                                    bg="blackAlpha.500"
                                    border="1px solid"
                                    borderColor="whiteAlpha.200"
                                    borderRadius="md"
                                    p={3}
                                >
                                    <Flex justify="space-between" align="center" gap={4}>
                                        <Flex align="center" gap={2} flex={1}>
                                            <Text fontSize="xs" color="whiteAlpha.700">起止时刻:</Text>
                                            <Text fontSize="sm" fontWeight="semibold" color="cyan.300">
                                                {(() => {
                                                    // 计算累计起止时间，考虑正在编辑的时长
                                                    let startTime = 0;
                                                    for (let i = 0; i < scenes.length; i++) {
                                                        if (scenes[i].id === scene.id) break;

                                                        // 如果之前的分镜正在被编辑，使用editDuration；否则使用数据库值
                                                        let currentDuration: number;
                                                        if (editingSceneId === scenes[i].id) {
                                                            // 正在编辑这个分镜，尝试解析editDuration
                                                            const parsed = parseFloat(editDuration);
                                                            currentDuration = !isNaN(parsed) && parsed > 0
                                                                ? parsed
                                                                : scenes[i].duration || 8;
                                                        } else {
                                                            currentDuration = scenes[i].duration || 8;
                                                        }

                                                        startTime += currentDuration;
                                                    }

                                                    // 当前分镜的时长：如果正在编辑则用editDuration，否则用数据库值
                                                    let currentSceneDuration: number;
                                                    if (editingSceneId === scene.id) {
                                                        // 正在编辑当前分镜，尝试解析editDuration
                                                        const parsed = parseFloat(editDuration);
                                                        currentSceneDuration = !isNaN(parsed) && parsed > 0
                                                            ? parsed
                                                            : scene.duration || 8;
                                                    } else {
                                                        currentSceneDuration = scene.duration || 8;
                                                    }

                                                    const endTime = startTime + currentSceneDuration;
                                                    return `${startTime.toFixed(1)}s - ${endTime.toFixed(1)}s`;
                                                })()}
                                            </Text>
                                        </Flex>

                                        <Flex align="center" gap={2}>
                                            <Text fontSize="xs" color="whiteAlpha.700">时长:</Text>
                                            {editingSceneId === scene.id ? (
                                                <Input
                                                    type="number"
                                                    value={editDuration}
                                                    onChange={(e) => setEditDuration(e.target.value)}
                                                    size="sm"
                                                    w="80px"
                                                    bg="blackAlpha.300"
                                                    border="1px solid"
                                                    borderColor="blue.500"
                                                    color="white"
                                                    _hover={{ borderColor: 'blue.400' }}
                                                    _focus={{ borderColor: 'blue.400', boxShadow: '0 0 0 1px var(--chakra-colors-blue-400)' }}
                                                    step="0.5"
                                                    min="1"
                                                    max="30"
                                                />
                                            ) : (
                                                <Text
                                                    fontSize="sm"
                                                    fontWeight="semibold"
                                                    color="yellow.300"
                                                    cursor="pointer"
                                                    onClick={() => {
                                                        handleEdit(scene);
                                                        setEditDuration((scene.duration || 8).toString());
                                                    }}
                                                    _hover={{ color: 'yellow.200', textDecoration: 'underline' }}
                                                >
                                                    {(scene.duration || 8).toFixed(1)}秒
                                                </Text>
                                            )}
                                        </Flex>
                                    </Flex>
                                </Box>
                            )}

                            <Box>
                                <Text fontSize="xs" fontWeight="medium" color="white" mb={2}>
                                    {isImage ? '首帧图提示词' : '视频提示词'}
                                </Text>
                                {editingSceneId === scene.id ? (
                                    <Textarea
                                        value={editPrompt}
                                        onChange={(e) => setEditPrompt(e.target.value)}
                                        bg="blackAlpha.300"
                                        border="2px"
                                        borderColor="whiteAlpha.200"
                                        _hover={{ borderColor: 'whiteAlpha.300' }}
                                        _focus={{ borderColor: 'blue.500', boxShadow: '0 0 0 1px var(--chakra-colors-blue-500)' }}
                                        color="white"
                                        minH="300px"
                                        fontSize="sm"
                                        placeholder={`输入${isImage ? '首帧图' : '视频'}提示词...`}
                                    />
                                ) : (
                                    <Box
                                        bg="blackAlpha.300"
                                        border="2px"
                                        borderColor="whiteAlpha.200"
                                        borderRadius="md"
                                        p={4}
                                        minH="300px"
                                        cursor="pointer"
                                        _hover={{ borderColor: 'whiteAlpha.300' }}
                                        onClick={() => handleEdit(scene)}
                                        fontSize="sm"
                                        color="white"
                                    >
                                        {scene[promptField] ? (
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                components={{
                                                    strong: (props) => <span style={{ color: '#F6E05E', fontWeight: 'bold' }} {...props} />,
                                                    em: (props) => <span style={{ color: '#76E4F7', fontStyle: 'normal' }} {...props} />,
                                                    p: ({ node, ...props }) => <p style={{ marginBottom: '0.5em', whiteSpace: 'pre-wrap' }} {...props} />
                                                }}
                                            >
                                                {scene[promptField]
                                                    .replace(/\n/g, '  \n')
                                                    .replace(/【(.*?)】/g, '**$1**')
                                                    .replace(/\[(.*?)\]/g, '*[$1]*')}
                                            </ReactMarkdown>
                                        ) : (
                                            <Text color="gray.500">点击编辑提示词...</Text>
                                        )}
                                    </Box>
                                )}
                            </Box>

                            <Flex gap={2}>
                                {editingSceneId === scene.id ? (
                                    <>
                                        <Button
                                            colorPalette="blue"
                                            size="sm"
                                            onClick={() => handleSave(scene.id)}
                                        >
                                            <Save size={16} />
                                            保存
                                        </Button>
                                        <Button
                                            bg="whiteAlpha.200"
                                            color="white"
                                            size="sm"
                                            _hover={{ bg: 'whiteAlpha.300' }}
                                            onClick={() => {
                                                setEditingSceneId(null);
                                                setEditDuration('');
                                            }}
                                        >
                                            取消
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <Button
                                            colorPalette="blue"
                                            size="sm"
                                            onClick={() => handleGenerate(scene.id)}
                                            disabled={generating.has(scene.id)}
                                        >
                                            {generating.has(scene.id) ? (
                                                generationStatus.has(scene.id) ? (
                                                    (() => {
                                                        const status = generationStatus.get(scene.id)!;
                                                        const statusText = {
                                                            'initializing': '初始化',
                                                            'queued': '排队中',
                                                            'processing': '生成中',
                                                        }[status.status] || status.status;
                                                        return (
                                                            <>
                                                                <Sparkles size={16} fill="white" />
                                                                {`${statusText} ${status.progress}%`}
                                                            </>
                                                        );
                                                    })()
                                                ) : (
                                                    <>
                                                        <Sparkles size={16} fill="white" />
                                                        生成中...
                                                    </>
                                                )
                                            ) : (
                                                <>
                                                    <Sparkles size={16} fill="white" />
                                                    生成
                                                </>
                                            )}
                                        </Button>
                                        <Button
                                            bg="whiteAlpha.200"
                                            color="white"
                                            size="sm"
                                            _hover={{ bg: 'whiteAlpha.300' }}
                                            onClick={() => handleGoToHistory(scene)}
                                        >
                                            <History size={16} />
                                            历史
                                        </Button>
                                        <Button
                                            bg="whiteAlpha.200"
                                            color="white"
                                            size="sm"
                                            _hover={{ bg: 'whiteAlpha.300' }}
                                            onClick={() => handleOpenUpload(scene.id)}
                                        >
                                            <Upload size={16} />
                                            上传
                                        </Button>
                                        {scene[latestUrlField] && (
                                            <Button
                                                bg="whiteAlpha.200"
                                                color="white"
                                                size="sm"
                                                _hover={{ bg: 'whiteAlpha.300' }}
                                                onClick={() => handleRevealInFinder(scene[latestUrlField]!)}
                                                title="在Finder中显示文件"
                                            >
                                                <FolderOpen size={16} />
                                                查看原文件
                                            </Button>
                                        )}
                                    </>
                                )}
                            </Flex>
                        </Stack>
                    </Flex>
                </Box>
            ))}

            {/* 上传对话框 */}
            <UploadDialog
                open={uploadDialogOpen}
                onClose={handleCloseUpload}
                sceneId={uploadingSceneId}
                projectId={projectId}
                type={type}
                onSuccess={() => {
                    if (uploadingSceneId) {
                        setMediaTimestamps(prev => ({ ...prev, [uploadingSceneId]: Date.now() }));
                    }
                    onUpdate();
                }}
            />
        </Stack>
    );
}

// 合成视频标签页组件
function CompositeTab({ projectId, projectType }: { projectId: string; projectType?: string }) {
    const isComic = projectType === 'comic';
    const [compositeVideos, setCompositeVideos] = useState<CompositeVideo[]>([]);
    const [loading, setLoading] = useState(true);
    const [composing, setComposing] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        loadCompositeHistory();
    }, [projectId]);

    const loadCompositeHistory = async () => {
        try {
            console.log(`🔄 加载合成历史: 项目ID=${projectId}`);
            const response = await fetch(`http://localhost:3001/api/projects/${projectId}/composites`);
            console.log(`📡 API响应状态: ${response.status}`);

            if (response.ok) {
                const data = await response.json();
                console.log(`✅ 加载到 ${data.length} 个合成视频:`, data);
                setCompositeVideos(data);
            } else {
                console.error(`❌ API返回错误状态: ${response.status}`);
            }
        } catch (error) {
            console.error('❌ 加载合成历史失败:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCompose = async () => {
        setComposing(true);
        try {
            console.log(`🎬 开始合成视频: 项目ID=${projectId}`);
            const response = await fetch(`http://localhost:3001/api/projects/${projectId}/composite`, {
                method: 'POST',
            });

            console.log(`📡 合成API响应状态: ${response.status}`);

            if (response.ok) {
                const result = await response.json();
                console.log(`✅ 合成成功:`, result);

                // 刷新历史记录
                console.log(`🔄 刷新历史记录...`);
                await loadCompositeHistory();
            } else {
                const error = await response.json();
                console.error(`❌ 合成失败:`, error);
                alert(error.error || '合成失败');
            }
        } catch (error) {
            console.error('❌ 合成失败:', error);
            alert('合成失败，请重试');
        } finally {
            setComposing(false);
        }
    };

    const getVideoUrl = (url: string) => {
        if (!url) return '';
        if (url.startsWith('http')) return url;
        return `http://localhost:3001${url}`;
    };

    const formatDateTime = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            await uploadCompositeVideo(files[0]);
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            await uploadCompositeVideo(files[0]);
        }
    };

    const uploadCompositeVideo = async (file: File) => {
        // 检查文件类型
        if (!file.type.startsWith('video/')) {
            alert('请上传视频文件');
            return;
        }

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch(`http://localhost:3001/api/projects/${projectId}/composite/upload`, {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                const result = await response.json();
                console.log('✅ 视频上传成功:', result);
                // 刷新历史记录
                await loadCompositeHistory();
            } else {
                const error = await response.json();
                console.error('❌ 上传失败:', error);
                alert(error.error || '上传失败');
            }
        } catch (error) {
            console.error('❌ 上传失败:', error);
            alert('上传失败，请重试');
        } finally {
            setUploading(false);
        }
    };

    if (loading) {
        return (
            <Center py={20}>
                <Stack align="center" gap={4}>
                    <Spinner size="xl" color="blue.500" />
                    <Text color="gray.400">加载中...</Text>
                </Stack>
            </Center>
        );
    }

    return (
        <Stack gap={6}>
            {/* 合成按钮 */}
            <Box
                bg="whiteAlpha.50"
                backdropFilter="blur(10px)"
                border="1px solid"
                borderColor="whiteAlpha.100"
                borderRadius="lg"
                p={6}
            >
                <Flex justify="space-between" align="center">
                    <Stack gap={1}>
                        <Text fontSize="lg" fontWeight="bold" color="white">
                            合成视频
                        </Text>
                        <Text fontSize="sm" color="gray.400">
                            将所有分镜的最新视频按顺序拼接成一个完整视频
                        </Text>
                    </Stack>
                    <Button
                        colorPalette="blue"
                        size="lg"
                        onClick={handleCompose}
                        loading={composing}
                    >
                        <FilmIcon size={20} />
                        {composing ? '合成中...' : '开始合成'}
                    </Button>
                </Flex>
            </Box>

            {/* 拖拽上传区域 */}
            <Box
                bg={isDragging ? 'blue.900' : 'whiteAlpha.50'}
                backdropFilter="blur(10px)"
                border="2px dashed"
                borderColor={isDragging ? 'blue.500' : 'whiteAlpha.200'}
                borderRadius="lg"
                p={8}
                textAlign="center"
                cursor="pointer"
                transition="all 0.2s"
                _hover={{
                    borderColor: 'blue.400',
                    bg: 'whiteAlpha.100'
                }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById('composite-upload-input')?.click()}
            >
                <input
                    type="file"
                    id="composite-upload-input"
                    accept="video/*"
                    style={{ display: 'none' }}
                    onChange={handleFileSelect}
                />
                <Stack align="center" gap={3}>
                    {uploading ? (
                        <>
                            <Spinner size="xl" color="blue.500" />
                            <Text fontSize="md" color="white" fontWeight="medium">
                                上传中...
                            </Text>
                        </>
                    ) : (
                        <>
                            <Upload size={48} color={isDragging ? '#3B82F6' : '#9CA3AF'} />
                            <Stack gap={1} align="center">
                                <Text fontSize="md" color="white" fontWeight="medium">
                                    {isDragging ? '松开以上传' : '拖拽视频到此处上传'}
                                </Text>
                                <Text fontSize="sm" color="gray.400">
                                    或点击选择文件
                                </Text>
                            </Stack>
                        </>
                    )}
                </Stack>
            </Box>

            {/* 历史记录标题 */}
            <Box>
                <Text fontSize="lg" fontWeight="bold" color="white" mb={4}>
                    合成历史 ({compositeVideos.length})
                </Text>

                {compositeVideos.length === 0 ? (
                    <Box
                        bg="whiteAlpha.50"
                        backdropFilter="blur(10px)"
                        border="1px solid"
                        borderColor="whiteAlpha.100"
                        borderRadius="lg"
                        p={12}
                        textAlign="center"
                    >
                        <Text color="gray.400" fontSize="md">
                            暂无合成历史，点击上方按钮开始合成视频
                        </Text>
                    </Box>
                ) : (
                    <SimpleGrid columns={4} gap={6}>
                        {compositeVideos.map((video) => (
                            <VideoCard
                                key={video.id}
                                video={video}
                                formatDateTime={formatDateTime}
                                getVideoUrl={getVideoUrl}
                            />
                        ))}
                    </SimpleGrid>
                )}
            </Box>
        </Stack>
    );
}

// 视频卡片组件
function VideoCard({
    video,
    formatDateTime,
    getVideoUrl,
}: {
    video: CompositeVideo;
    formatDateTime: (date: string) => string;
    getVideoUrl: (url: string) => string;
}) {
    const [isHovered, setIsHovered] = useState(false);

    const fullVideoUrl = getVideoUrl(video.video_url);
    console.log(`🎥 渲染视频卡片 #${video.id}:`, {
        video_url: video.video_url,
        full_url: fullVideoUrl,
        scene_count: video.scene_count,
        created_at: video.created_at
    });

    const handleRevealInFinder = async () => {
        try {
            await fetch('http://localhost:3001/api/files/reveal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_path: video.video_url }),
            });
        } catch (error) {
            console.error('打开目录失败:', error);
        }
    };

    return (
        <Box
            bg="whiteAlpha.50"
            backdropFilter="blur(10px)"
            border="1px solid"
            borderColor="whiteAlpha.100"
            borderRadius="lg"
            overflow="hidden"
            transition="all 0.2s"
            _hover={{
                borderColor: 'blue.500',
                transform: 'translateY(-4px)',
                boxShadow: 'lg',
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* 视频播放器容器 */}
            <Box position="relative">
                <video
                    style={{
                        width: '100%',
                        aspectRatio: '9/16',
                        backgroundColor: 'black',
                    }}
                    controls
                    src={fullVideoUrl}
                />

                {/* 右上角打开目录按钮 */}
                {isHovered && (
                    <IconButton
                        aria-label="在Finder中显示"
                        position="absolute"
                        top={2}
                        right={2}
                        size="sm"
                        colorPalette="blue"
                        bg="blue.600"
                        _hover={{ bg: 'blue.500' }}
                        onClick={handleRevealInFinder}
                        title="在Finder中显示"
                    >
                        <FolderOpen size={16} />
                    </IconButton>
                )}
            </Box>

            {/* 信息标签 */}
            <Stack gap={2} p={3}>
                <Flex justify="space-between" align="center">
                    <Box
                        bg="blue.900"
                        px={2}
                        py={0.5}
                        borderRadius="md"
                        fontSize="xs"
                        color="blue.200"
                    >
                        #{video.id}
                    </Box>
                    {video.scene_count > 0 && (
                        <Box
                            bg="purple.900"
                            px={2}
                            py={0.5}
                            borderRadius="md"
                            fontSize="xs"
                            color="purple.200"
                        >
                            {video.scene_count} 个分镜
                        </Box>
                    )}
                    {video.scene_count === 0 && (
                        <Box
                            bg="green.900"
                            px={2}
                            py={0.5}
                            borderRadius="md"
                            fontSize="xs"
                            color="green.200"
                        >
                            手动上传
                        </Box>
                    )}
                </Flex>
                <Text fontSize="xs" color="gray.400">
                    {formatDateTime(video.created_at)}
                </Text>
            </Stack>
        </Box>
    );
}
