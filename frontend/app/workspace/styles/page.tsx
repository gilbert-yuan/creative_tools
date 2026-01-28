'use client'

import { useState } from 'react'
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
  Badge,
  IconButton,
  Image,
  Card,
} from '@chakra-ui/react'
import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogCloseTrigger,
  DialogTitle,
  DialogFooter,
  DialogActionTrigger,
  DialogBackdrop,
} from '@chakra-ui/react'
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from '@chakra-ui/react'
import { Plus, MoreVertical, Edit, Trash2, Eye } from 'lucide-react'
import { Style } from '@/types/style'
import { mockStyles, mockStyleCategories } from '@/lib/mockData'
import MainLayout from '@/components/MainLayout'

function StyleCard({ style, onEdit, onDelete, onView }: {
  style: Style
  onEdit: () => void
  onDelete: () => void
  onView: () => void
}) {
  return (
    <Card.Root
      overflow="hidden"
      bg="whiteAlpha.50"
      backdropFilter="blur(10px)"
      borderRadius="lg"
      border="1px"
      borderColor="whiteAlpha.100"
      _hover={{ transform: 'translateY(-4px)', borderColor: 'purple.400', bg: 'whiteAlpha.100' }}
      transition="all 0.2s"
    >
      <Image
        src={style.thumbnailUrl}
        alt={style.name}
        height="160px"
        objectFit="cover"
        width="100%"
      />
      <Card.Body p={4}>
        <Flex justify="space-between" align="start" mb={2}>
          <Heading size="md" flex="1" color="white">{style.name}</Heading>
          <MenuRoot>
            <MenuTrigger asChild>
              <IconButton
                size="sm"
                variant="ghost"
                color="whiteAlpha.700"
                _hover={{ bg: 'whiteAlpha.200', color: 'white' }}
                aria-label="更多操作"
              >
                <MoreVertical size={16} />
              </IconButton>
            </MenuTrigger>
            <MenuContent bg="gray.900" borderColor="whiteAlpha.200">
              <MenuItem value="view" onClick={onView} _hover={{ bg: 'whiteAlpha.100' }} color="gray.200">
                <Flex align="center" gap={2}>
                  <Eye size={16} />
                  <Text>查看详情</Text>
                </Flex>
              </MenuItem>
              <MenuItem value="edit" onClick={onEdit} _hover={{ bg: 'whiteAlpha.100' }} color="gray.200">
                <Flex align="center" gap={2}>
                  <Edit size={16} />
                  <Text>编辑</Text>
                </Flex>
              </MenuItem>
              <MenuItem value="delete" onClick={onDelete} color="red.400" _hover={{ bg: 'whiteAlpha.100' }}>
                <Flex align="center" gap={2}>
                  <Trash2 size={16} />
                  <Text>删除</Text>
                </Flex>
              </MenuItem>
            </MenuContent>
          </MenuRoot>
        </Flex>

        <Text color="gray.400" fontSize="sm" mb={3} lineClamp={2}>
          {style.description}
        </Text>

        <Flex gap={2} flexWrap="wrap" mb={2}>
          {style.tags.map((tag) => (
            <Badge key={tag} size="sm" colorPalette="purple" variant="solid">
              {tag}
            </Badge>
          ))}
        </Flex>

        <Text fontSize="xs" color="gray.500">
          分类: {style.category}
        </Text>
      </Card.Body>
    </Card.Root>
  )
}

export default function StylesPage() {
  const [styles, setStyles] = useState<Style[]>(mockStyles)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('全部')
  const [viewDialogOpen, setViewDialogOpen] = useState(false)
  const [selectedStyle, setSelectedStyle] = useState<Style | null>(null)

  // 过滤风格
  const filteredStyles = styles.filter((style) => {
    const matchesSearch = style.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      style.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      style.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesCategory = selectedCategory === '全部' || style.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  const handleView = (style: Style) => {
    setSelectedStyle(style)
    setViewDialogOpen(true)
  }

  const handleEdit = () => {
    alert('编辑功能开发中...')
  }

  const handleDelete = (style: Style) => {
    if (confirm(`确定要删除 "${style.name}" 吗？`)) {
      setStyles(styles.filter(s => s.id !== style.id))
    }
  }

  const handleAddNew = () => {
    alert('添加功能开发中...')
  }

  return (
    <MainLayout>
      <Container maxW="7xl" py={8}>
        <Stack gap={6}>
          {/* 头部 */}
          <Flex justify="space-between" align="center">
            <Box>
              <Heading size="xl" mb={2} color="white">风格资源库</Heading>
              <Text color="gray.400">
                管理您的风格资源，共 {filteredStyles.length} 个风格
              </Text>
            </Box>
            <Button
              colorPalette="purple"
              onClick={handleAddNew}
            >
              <Plus size={20} style={{ marginRight: '8px' }} />
              添加风格
            </Button>
          </Flex>

          {/* 搜索栏 */}
          <Box>
            <Input
              placeholder="搜索风格名称、描述或标签..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              size="lg"
              bg="whiteAlpha.100"
              border="none"
              color="white"
              _focus={{ bg: 'whiteAlpha.200', ring: 1, ringColor: 'purple.500' }}
            />
          </Box>

          {/* 分类筛选 */}
          <Flex gap={3} flexWrap="wrap">
            {mockStyleCategories.map((category) => (
              <Button
                key={category.id}
                size="md"
                variant={selectedCategory === category.name ? 'solid' : 'outline'}
                colorPalette="purple"
                onClick={() => setSelectedCategory(category.name)}
                bg={selectedCategory === category.name ? undefined : 'whiteAlpha.50'}
                color={selectedCategory === category.name ? undefined : 'gray.400'}
                borderColor={selectedCategory === category.name ? undefined : 'whiteAlpha.200'}
                _hover={{
                  bg: selectedCategory === category.name ? undefined : 'whiteAlpha.200',
                  borderColor: selectedCategory === category.name ? undefined : 'whiteAlpha.400',
                  color: selectedCategory === category.name ? undefined : 'white',
                }}
                transition="all 0.2s"
                fontWeight="medium"
                px={5}
                borderRadius="full"
              >
                {category.name} ({category.count})
              </Button>
            ))}
          </Flex>

          {/* 风格网格 */}
          {filteredStyles.length > 0 ? (
            <SimpleGrid columns={{ base: 1, md: 2, lg: 3, xl: 4 }} gap={6}>
              {filteredStyles.map((style) => (
                <StyleCard
                  key={style.id}
                  style={style}
                  onView={() => handleView(style)}
                  onEdit={handleEdit}
                  onDelete={() => handleDelete(style)}
                />
              ))}
            </SimpleGrid>
          ) : (
            <Box textAlign="center" py={20}>
              <Text color="gray.400" fontSize="lg">
                未找到匹配的风格
              </Text>
            </Box>
          )}
        </Stack>

        {/* 查看详情对话框 */}
        <DialogRoot
          open={viewDialogOpen}
          onOpenChange={(e) => setViewDialogOpen(e.open)}
          size="lg"
        >
          <DialogBackdrop />
          <DialogContent
            bg="gray.900"
            border="1px solid"
            borderColor="whiteAlpha.200"
            color="white"
          >
            <DialogHeader>
              <DialogTitle>{selectedStyle?.name}</DialogTitle>
              <DialogCloseTrigger color="gray.400" _hover={{ color: 'white' }} />
            </DialogHeader>
            <DialogBody>
              {selectedStyle && (
                <Stack gap={4}>
                  <Image
                    src={selectedStyle.previewUrl}
                    alt={selectedStyle.name}
                    borderRadius="lg"
                    maxH="400px"
                    objectFit="cover"
                  />
                  <Box>
                    <Text fontWeight="bold" mb={2}>描述</Text>
                    <Text color="gray.400">{selectedStyle.description}</Text>
                  </Box>
                  <Box>
                    <Text fontWeight="bold" mb={2}>标签</Text>
                    <Flex gap={2} flexWrap="wrap">
                      {selectedStyle.tags.map((tag) => (
                        <Badge key={tag} colorPalette="purple" variant="solid">
                          {tag}
                        </Badge>
                      ))}
                    </Flex>
                  </Box>
                  <Box>
                    <Text fontWeight="bold" mb={2}>分类</Text>
                    <Text color="gray.400">{selectedStyle.category}</Text>
                  </Box>
                  {selectedStyle.parameters && (
                    <Box>
                      <Text fontWeight="bold" mb={2}>参数设置</Text>
                      <Box bg="blackAlpha.400" p={3} borderRadius="md" border="1px solid" borderColor="whiteAlpha.100">
                        <pre style={{ fontSize: '12px', color: '#a0aec0' }}>
                          {JSON.stringify(selectedStyle.parameters, null, 2)}
                        </pre>
                      </Box>
                    </Box>
                  )}
                  <Box>
                    <Text fontWeight="bold" mb={2}>创建时间</Text>
                    <Text color="gray.400">
                      {new Date(selectedStyle.createdAt).toLocaleString('zh-CN')}
                    </Text>
                  </Box>
                </Stack>
              )}
            </DialogBody>
            <DialogFooter>
              <DialogActionTrigger asChild>
                <Button variant="outline" color="white" borderColor="whiteAlpha.300" _hover={{ bg: 'whiteAlpha.100' }}>关闭</Button>
              </DialogActionTrigger>
            </DialogFooter>
          </DialogContent>
        </DialogRoot>
      </Container>
    </MainLayout>
  )
}
