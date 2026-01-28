'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Box,
  Container,
  Heading,
  Text,
  SimpleGrid,
  Button,
  Input,
  Stack,
  Flex,
  IconButton,
  Textarea,
  Badge,
  Tabs,
} from '@chakra-ui/react'

import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from '@chakra-ui/react'
import { DialogRoot, DialogContent, DialogBody, DialogCloseTrigger, DialogBackdrop } from '@chakra-ui/react'
import { Plus, MoreVertical, Edit, Trash2, Eye, Upload, Copy, Sparkles, Image as ImageIcon, Check } from 'lucide-react'
import MainLayout from '@/components/MainLayout'
import { Image, Spinner, Center } from '@chakra-ui/react'
import { createToaster } from '@chakra-ui/react'

const toaster = createToaster({
  placement: 'top',
  duration: 2000,
})

interface SystemCharacter {
  id: string;
  name: string;
  image_url: string | null;
  prompt: string | null;
  category: string | null;
  tags: string[];
  status: number;
  derived_from: string | null;
  created_at: string;
}

function CharacterCard({ character, onEdit, onDelete }: {
  character: SystemCharacter
  onEdit: () => void
  onDelete: () => void
}) {
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);

  const getImageUrl = (url: string | null) => {
    if (!url) return '';
    // Use character's created_at timestamp to bust cache when image is regenerated
    const timestamp = new Date(character.created_at).getTime();
    if (url.startsWith('http')) return `${url}?t=${timestamp}`;
    return `http://localhost:3001${url}?t=${timestamp}`;
  };

  const handleCopyId = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(character.id);
      toaster.create({
        title: '已复制ID',
        description: character.id,
        type: 'success',
        duration: 2000,
      });
    } catch (err) {
      toaster.create({
        title: '复制失败',
        type: 'error',
        duration: 2000,
      });
    }
  };

  const handleImageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (character.image_url) {
      setImagePreviewOpen(true);
    }
  };

  return (
    <>
      <Box
        bg="whiteAlpha.50"
        borderRadius="lg"
        overflow="hidden"
        border="1px solid"
        borderColor="whiteAlpha.100"
        backdropFilter="blur(10px)"
        _hover={{
          transform: 'translateY(-4px)',
          shadow: 'lg',
          borderColor: 'blue.400',
          bg: 'whiteAlpha.100',
          '& .action-buttons': { opacity: 1, transform: 'translateY(0)' }
        }}
        transition="all 0.3s"
        position="relative"
        role="group"
        h="full"
        display="flex"
        flexDirection="column"
      >
        {/* 图片区域 */}
        <Box
          h="200px"
          position="relative"
          bg="blackAlpha.500"
          overflow="hidden"
          cursor={character.image_url ? "pointer" : "default"}
          onClick={handleImageClick}
        >
          {character.image_url ? (
            <Image
              key={character.image_url + character.created_at}
              src={getImageUrl(character.image_url)}
              alt={character.name}
              w="100%"
              h="100%"
              objectFit="contain"
              transition="transform 0.5s"
              _groupHover={{ transform: 'scale(1.05)' }}
            />
          ) : (
            <Center h="100%" flexDirection="column" gap={2} bg="whiteAlpha.50">
              <ImageIcon size={24} color="gray" />
              <Text color="gray.500" fontSize="sm">暂无图片</Text>
            </Center>
          )}

          {/* 顶部悬浮操作栏 */}
          <Box
            className="action-buttons"
            position="absolute"
            top={0}
            left={0}
            right={0}
            p={2}
            bg="linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)"
            opacity={0}
            transform="translateY(-10px)"
            transition="all 0.2s"
            display="flex"
            justifyContent="flex-end"
            gap={1}
          >
            <IconButton size="xs" variant="surface" colorPalette="gray" onClick={handleCopyId} aria-label="复制ID">
              <Copy size={12} />
            </IconButton>
            <IconButton size="xs" variant="surface" colorPalette="blue" onClick={onEdit} aria-label="编辑">
              <Edit size={12} />
            </IconButton>
            <IconButton size="xs" variant="surface" colorPalette="red" onClick={onDelete} aria-label="删除">
              <Trash2 size={12} />
            </IconButton>
          </Box>
        </Box>

        {/* 文本内容区域 */}
        <Stack gap={2} p={3} flex={1}>
          <Flex justify="space-between" align="start">
            <Heading size="sm" color="white" lineClamp={1} title={character.name}>
              {character.name}
            </Heading>
          </Flex>

          <Flex gap={1} flexWrap="wrap">
            {character.category && (
              <Badge colorPalette="blue" variant="solid" size="xs">{character.category}</Badge>
            )}
            {character.tags.slice(0, 2).map((tag, i) => (
              <Badge key={i} colorPalette="gray" variant="solid" size="xs">#{tag}</Badge>
            ))}
          </Flex>

          <Text fontSize="xs" color="gray.400" lineClamp={2} lineHeight="tall">
            {character.prompt || '暂无详细设定...'}
          </Text>
        </Stack>
      </Box>

      {/* 图片预览对话框 */}
      <DialogRoot open={imagePreviewOpen} onOpenChange={(e) => setImagePreviewOpen(e.open)} size="xl">
        <DialogBackdrop />
        <DialogContent
          position="fixed"
          top="50%"
          left="50%"
          transform="translate(-50%, -50%)"
          maxH="85vh"
        >
          <DialogCloseTrigger />
          <DialogBody p={0}>
            <Image
              key={character.image_url + character.created_at}
              src={getImageUrl(character.image_url)}
              alt={character.name}
              w="100%"
              h="auto"
              maxH="80vh"
              objectFit="contain"
            />
          </DialogBody>
        </DialogContent>
      </DialogRoot>
    </>
  )
}

// Generation State Types
interface GenerationTask {
  startTime: number;
  status: 'generating' | 'error';
  error?: string;
}

function PendingCharacterCard({ character, onGenerate, onEdit, onDelete, onAdopt, generationTask }: {
  character: SystemCharacter
  onGenerate: () => Promise<void>
  onEdit: () => void
  onDelete: () => void
  onAdopt: () => void
  generationTask?: GenerationTask
}) {
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const isGenerating = generationTask?.status === 'generating';
  const isError = generationTask?.status === 'error';

  const getImageUrl = (url: string | null) => {
    if (!url) return '';
    // Use character's created_at timestamp to bust cache when image is regenerated
    const timestamp = new Date(character.created_at).getTime();
    if (url.startsWith('http')) return `${url}?t=${timestamp}`;
    return `http://localhost:3001${url}?t=${timestamp}`;
  };

  const handleImageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (character.image_url) {
      setImagePreviewOpen(true);
    }
  };

  return (
    <>
      <Box
        bg="whiteAlpha.50"
        borderRadius="lg"
        overflow="hidden"
        border="1px dashed"
        borderColor="yellow.600"
        backdropFilter="blur(10px)"
        _hover={{
          transform: 'translateY(-4px)',
          shadow: 'lg',
          borderColor: isError ? 'red.400' : 'yellow.400',
          bg: 'whiteAlpha.100',
          '& .action-buttons': { opacity: 1, transform: 'translateY(0)' }
        }}
        transition="all 0.3s"
        position="relative"
        h="full"
        display="flex"
        flexDirection="column"
      >
        {/* 占位图区域 */}
        <Box
          h="200px"
          position="relative"
          bg="whiteAlpha.50"
          cursor={character.image_url ? "pointer" : "default"}
          onClick={handleImageClick}
        >
          {character.image_url ? (
            <Image
              key={character.image_url + character.created_at}
              src={getImageUrl(character.image_url)}
              alt={character.name}
              w="100%"
              h="100%"
              objectFit="contain"
            />
          ) : (
            <Center h="100%" color="yellow.500" flexDirection="column" gap={2}>
              <Box
                p={3}
                borderRadius="full"
                bg="yellow.500/10"
                border="1px solid"
                borderColor="yellow.500/20"
              >
                <Sparkles size={24} />
              </Box>
              <Badge colorPalette="yellow" variant="solid" size="sm">待生成</Badge>
            </Center>
          )}

          {/* 顶部悬浮操作栏 */}
          <Box
            className="action-buttons"
            position="absolute"
            top={0}
            left={0}
            right={0}
            p={2}
            bg="linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)"
            opacity={0}
            transform="translateY(-10px)"
            transition="all 0.2s"
            display="flex"
            justifyContent="flex-end"
            gap={1}
          >
            {character.image_url && (
              <IconButton size="xs" variant="surface" colorPalette="green" onClick={onAdopt} aria-label="录用">
                <Check size={12} />
              </IconButton>
            )}
            <IconButton size="xs" variant="surface" colorPalette="blue" onClick={onEdit} aria-label="编辑">
              <Edit size={12} />
            </IconButton>
            <IconButton size="xs" variant="surface" colorPalette="red" onClick={onDelete} aria-label="删除">
              <Trash2 size={12} />
            </IconButton>
          </Box>
        </Box>

        <Stack gap={3} p={3} flex={1} justify="space-between">
          <Stack gap={2}>
            <Heading size="sm" color="white" lineClamp={1}>
              {character.name}
            </Heading>
            <Flex gap={1} flexWrap="wrap">
              {character.category && (
                <Badge colorPalette="blue" variant="subtle" size="xs">{character.category}</Badge>
              )}
              {character.tags.slice(0, 2).map((tag, i) => (
                <Badge key={i} colorPalette="gray" variant="subtle" size="xs">#{tag}</Badge>
              ))}
            </Flex>
            <Text fontSize="xs" color="gray.400" lineClamp={2}>
              {character.prompt || '等待生成角色画像...'}
            </Text>
          </Stack>

          <Button
            colorPalette={isError ? "red" : "yellow"}
            variant="solid"
            size="sm"
            w="full"
            onClick={onGenerate}
            loading={isGenerating}
            disabled={isGenerating}
          >
            <Sparkles size={14} style={{ marginRight: '4px' }} />
            {isGenerating ? '绘制中...' : isError ? '重试生成' : '生成图片'}
          </Button>
        </Stack>
      </Box>

      {/* 图片预览对话框 */}
      <DialogRoot open={imagePreviewOpen} onOpenChange={(e) => setImagePreviewOpen(e.open)} size="xl">
        <DialogBackdrop />
        <DialogContent
          position="fixed"
          top="50%"
          left="50%"
          transform="translate(-50%, -50%)"
          maxH="85vh"
        >
          <DialogCloseTrigger />
          <DialogBody p={0}>
            <Image
              key={character.image_url + character.created_at}
              src={getImageUrl(character.image_url)}
              alt={character.name}
              w="100%"
              h="auto"
              maxH="80vh"
              objectFit="contain"
            />
          </DialogBody>
        </DialogContent>
      </DialogRoot>
    </>
  )
}

export default function CharactersPage() {
  const router = useRouter()
  const [characters, setCharacters] = useState<SystemCharacter[]>([])
  const [pendingCharacters, setPendingCharacters] = useState<SystemCharacter[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  // Check URL params for tab
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const initialTab = searchParams?.get('tab') === 'pending' ? 'pending' : 'all'
  const [activeTab, setActiveTab] = useState(initialTab)

  const fetchCharacters = async (query = '') => {
    setLoading(true)
    try {
      const url = query
        ? `http://localhost:3001/api/system-characters?query=${encodeURIComponent(query)}`
        : `http://localhost:3001/api/system-characters`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          // Filter out pending characters (status 0 or no image if status is missing)
          const validCharacters = data.filter((c: SystemCharacter) =>
            c.status === 1 || (c.status === undefined && !!c.image_url)
          );
          setCharacters(validCharacters);
        }
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const fetchPendingCharacters = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/characters/pending');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setPendingCharacters(data);
        }
      }
    } catch (e) { console.error(e) }
  }

  // Generation Tasks State
  const [tasks, setTasks] = useState<Record<string, GenerationTask>>({});

  useEffect(() => {
    // Load tasks from localStorage on mount
    const saved = localStorage.getItem('char_gen_tasks');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Clean up old tasks (> 2 mins to be safe, logic says 1 min timeout)
        const now = Date.now();
        const cleaned: Record<string, GenerationTask> = {};
        Object.entries(parsed).forEach(([id, task]: [string, any]) => {
          if (now - task.startTime < 120000) { // Keep recent ones
            cleaned[id] = task;
          }
        });
        setTasks(cleaned);
      } catch (e) { console.error('Failed to parse tasks', e) }
    }
  }, []);

  // Polling for status updates
  useEffect(() => {
    const hasActiveTasks = Object.values(tasks).some(t => t.status === 'generating');
    if (!hasActiveTasks) return;

    const interval = setInterval(() => {
      fetchPendingCharacters(); // This updates pendingCharacters list with new data

      setTasks(prev => {
        const next = { ...prev };
        let changed = false;
        const now = Date.now();

        // We need access to the latest character data to check if images exist.
        // Since we can't easily access the very latest fetch result inside this setter cleanly without deps,
        // we will rely on checking if the Pending list still has them as "no image" 
        // OR ideally we should check the list.
        // Actually, fetchPendingCharacters updates `pendingCharacters` state.
        // BUT `pendingCharacters` in this closure might be stale if we don't add it to dependency.
        // Adding `pendingCharacters` to dependency restarts interval, which is fine but maybe chatty.
        // Let's do the check in a separate effect or just update time-based failures here.

        // TIMEOUT CHECK
        for (const id in next) {
          if (next[id].status === 'generating' && (now - next[id].startTime > 60000)) {
            next[id] = { ...next[id], status: 'error', error: '生成超时，请重试' };
            changed = true;
          }
        }

        if (changed) {
          localStorage.setItem('char_gen_tasks', JSON.stringify(next));
          return next;
        }
        return prev;
      });

    }, 3000);

    return () => clearInterval(interval);
  }, [tasks]);

  // Check for completion based on pendingCharacters updates
  useEffect(() => {
    setTasks(prev => {
      const next = { ...prev };
      let changed = false;

      pendingCharacters.forEach(char => {
        if (next[char.id]?.status === 'generating' && char.image_url) {
          // Character now has image, remove task
          delete next[char.id];
          changed = true;
          toaster.create({ title: `${char.name} 生成完成`, type: 'success' });
        }
      });

      if (changed) {
        localStorage.setItem('char_gen_tasks', JSON.stringify(next));
        return next;
      }
      return prev;
    });
  }, [pendingCharacters]);

  useEffect(() => {
    setMounted(true)
    fetchCharacters()
    fetchPendingCharacters()
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (mounted) fetchCharacters(searchQuery)
    }, 500)
    return () => clearTimeout(timer)
  }, [searchQuery, mounted])

  const handleEdit = (character: SystemCharacter) => {
    router.push(`/workspace/characters/${character.id}`)
  }

  const handleCreate = () => {
    // This is now handled by the Link component directly, but kept if needed for other logic
    router.push('/workspace/characters/new')
  }



  const handleGenerate = async (character: SystemCharacter) => {
    // 1. Set local state
    const newTask: GenerationTask = { startTime: Date.now(), status: 'generating' };
    const newTasks = { ...tasks, [character.id]: newTask };
    setTasks(newTasks);
    localStorage.setItem('char_gen_tasks', JSON.stringify(newTasks));

    toaster.create({
      title: '开始生成...',
      description: `正在为 ${character.name} 生成图片 (将在后台运行)`,
      type: 'info',
    })

    try {
      // 2. Fire API
      const res = await fetch(`http://localhost:3001/api/characters/${character.id}/generate`, {
        method: 'POST'
      });

      if (res.ok) {
        // Success handled by polling (image_url will appear)
        fetchPendingCharacters();
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Server rejected');
      }
    } catch (e: any) {
      console.error(e)
      // Update task to error
      setTasks(prev => {
        const next = { ...prev, [character.id]: { startTime: newTask.startTime, status: 'error' as const, error: e.message } };
        localStorage.setItem('char_gen_tasks', JSON.stringify(next));
        return next;
      });
      toaster.create({
        title: '生成失败',
        description: e.message,
        type: 'error',
      })
    }
  }


  const handleAdopt = async (character: SystemCharacter) => {
    try {
      const res = await fetch(`http://localhost:3001/api/characters/${character.id}/adopt`, {
        method: 'POST'
      });
      if (res.ok) {
        toaster.create({
          title: '已录用',
          description: `${character.name} 已加入角色库`,
          type: 'success',
        })
        fetchPendingCharacters()
        fetchCharacters(searchQuery)
      }
    } catch (e) {
      console.error(e)
      toaster.create({
        title: '操作失败',
        type: 'error',
      })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此角色？此操作不可逆，且会影响所有关联项目。')) return;

    try {
      const res = await fetch(`http://localhost:3001/api/characters/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchCharacters(searchQuery);
        fetchPendingCharacters(); // 刷新待生成列表
      } else {
        const data = await res.json();
        alert(`删除失败: ${data.error}`);
      }
    } catch (e) {
      console.error(e);
      alert('删除失败');
    }
  }





  return (
    <MainLayout>
      {mounted && (
        <Container maxW="full" px={6} py={6}>
          <Stack gap={6}>
            {/* 头部：标题 + Tabs + 按钮 */}
            <Flex justify="space-between" align="center" wrap="wrap" gap={4} position="relative">
              <Box>
                <Heading size="xl" mb={1} color="white">角色库</Heading>
                <Text color="gray.400" fontSize="sm">
                  管理您的角色资源，共 {characters.length} 个角色
                </Text>
              </Box>

              {/* Tabs - 绝对定位居中 (大屏) */}
              <Box
                position={{ base: 'static', md: 'absolute' }}
                left={{ md: '50%' }}
                transform={{ md: 'translateX(-50%)' }}
                w={{ base: 'full', md: 'auto' }}
                textAlign="center"
              >
                <Tabs.Root value={activeTab} onValueChange={(e) => setActiveTab(e.value)} variant="plain" display="inline-block">
                  <Tabs.List
                    bg="whiteAlpha.100"
                    borderRadius="lg"
                    p={1}
                  >
                    <Tabs.Trigger
                      value="all"
                      py={1.5}
                      px={4}
                      fontSize="sm"
                      color="gray.400"
                      _selected={{
                        color: "blue.300",
                        bg: "whiteAlpha.200",
                        fontWeight: "semibold",
                        shadow: "sm"
                      }}
                    >
                      全部角色 ({characters.length})
                    </Tabs.Trigger>
                    <Tabs.Trigger
                      value="pending"
                      py={1.5}
                      px={4}
                      fontSize="sm"
                      color="gray.400"
                      _selected={{
                        color: "yellow.300",
                        bg: "whiteAlpha.200",
                        fontWeight: "semibold",
                        shadow: "sm"
                      }}
                    >
                      待生成 ({pendingCharacters.length})
                    </Tabs.Trigger>
                  </Tabs.List>
                </Tabs.Root>
              </Box>

              <Flex gap={3} align="center">
                <Box w="300px">
                  <Input
                    placeholder="搜索角色..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    size="sm"
                    bg="whiteAlpha.100"
                    border="none"
                    color="white"
                    _focus={{ bg: 'whiteAlpha.200', ring: 1, ringColor: 'blue.500' }}
                  />
                </Box>
                <Link href="/workspace/characters/new">
                  <Button
                    colorPalette="blue"
                  >
                    <Plus size={20} style={{ marginRight: '8px' }} />
                    新增角色
                  </Button>
                </Link>
              </Flex>
            </Flex>





            {/* 角色网格 */}
            {loading ? (
              <Center py={20}><Spinner /></Center>
            ) : activeTab === 'all' ? (
              characters.length > 0 ? (
                <SimpleGrid columns={{ base: 1, sm: 2, md: 3, lg: 4, xl: 4 }} gap={6}>
                  {characters.map((character) => (
                    <CharacterCard
                      key={character.id}
                      character={character}
                      onEdit={() => handleEdit(character)}
                      onDelete={() => handleDelete(character.id)}
                    />
                  ))}
                </SimpleGrid>
              ) : (
                <Box textAlign="center" py={20}>
                  <Text color="gray.400" fontSize="lg">
                    未找到匹配的角色
                  </Text>
                </Box>
              )
            ) : (
              // Pending Characters Tab
              pendingCharacters.length > 0 ? (
                <SimpleGrid columns={{ base: 1, sm: 2, md: 3, lg: 4, xl: 4 }} gap={6}>
                  {pendingCharacters.map((character) => (
                    <PendingCharacterCard
                      key={character.id}
                      character={character}
                      onEdit={() => handleEdit(character)}
                      onDelete={() => handleDelete(character.id)}
                      onAdopt={() => handleAdopt(character)}
                      onGenerate={() => handleGenerate(character)}
                      generationTask={tasks[character.id]}
                    />
                  ))}
                </SimpleGrid>
              ) : (
                <Box textAlign="center" py={20}>
                  <Text color="gray.400" fontSize="lg">
                    暂无待生成角色
                  </Text>
                </Box>
              )
            )}
          </Stack>

          {/* 编辑/新增对话框 */}

        </Container>
      )}
    </MainLayout>
  )
}
