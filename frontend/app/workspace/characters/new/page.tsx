'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
    Box,
    Container,
    Heading,
    Text,
    Stack,
    Button,
    Input,
    Textarea,
    Flex,
    IconButton,
    Center,
    Image,
} from '@chakra-ui/react'
import { Upload, Sparkles, ArrowLeft, X } from 'lucide-react'
import MainLayout from '@/components/MainLayout'
import Link from 'next/link'
import { createToaster } from '@chakra-ui/react'

const toaster = createToaster({
    placement: 'top',
    duration: 3000,
})

export default function NewCharacterPage() {
    const router = useRouter()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [formData, setFormData] = useState({
        name: '',
        prompt: '',
        category: '',
    })
    const [tags, setTags] = useState<string>('')
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [imagePreview, setImagePreview] = useState<string>('')
    const [imageSource, setImageSource] = useState<'uploaded' | 'generated' | null>(null)
    const [generatedImageUrl, setGeneratedImageUrl] = useState<string>('')
    const [saving, setSaving] = useState(false)
    const [generating, setGenerating] = useState(false)
    const [autoFilling, setAutoFilling] = useState(false)

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0]
            setImageFile(file)
            setImagePreview(URL.createObjectURL(file))
            setImageSource('uploaded')
        }
    }

    const handleRemoveImage = () => {
        setImageFile(null)
        setImagePreview('')
        setGeneratedImageUrl('')
        setImageSource(null)
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }



    const handleAIGenerate = async () => {
        // Validation: require prompt
        if (!formData.prompt.trim()) {
            toaster.create({
                title: '请先输入提示词',
                description: 'AI生成需要提示词作为输入',
                type: 'error',
            })
            return
        }

        setGenerating(true)
        try {
            // Case 1: Image + prompt -> img2img
            if (imagePreview && formData.prompt) {
                // Convert image to base64
                const base64Data = await convertImageToBase64(imagePreview)

                const response = await fetch('http://localhost:3001/api/characters/img2img', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        image_base64: base64Data.data,
                        mime_type: base64Data.mimeType,
                        prompt: formData.prompt
                    }),
                })

                if (response.ok) {
                    const data = await response.json()
                    if (data.image_url) {
                        const fullUrl = `http://localhost:3001${data.image_url}`
                        setImagePreview(fullUrl)
                        setGeneratedImageUrl(data.image_url)
                        setImageSource('generated')
                        setImageFile(null) // Clear uploaded file
                    }
                    toaster.create({
                        title: '图片编辑成功',
                        type: 'success',
                    })
                } else {
                    const errorData = await response.json()
                    throw new Error(errorData.error || 'img2img failed')
                }
            }
            // Case 2: Only prompt -> text2img (create temporary character)
            else if (!imagePreview && formData.prompt) {
                // Create a temporary pending character and generate
                const tempChar = await fetch('http://localhost:3001/api/characters', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: formData.name || 'Temporary',
                        prompt: formData.prompt,
                        category: formData.category || null,
                        tags: [],
                    }),
                })

                if (!tempChar.ok) throw new Error('Failed to create temp character')
                const tempData = await tempChar.json()

                // Generate image
                const genResponse = await fetch(`http://localhost:3001/api/characters/${tempData.id}/generate`, {
                    method: 'POST'
                })

                if (genResponse.ok) {
                    const genData = await genResponse.json()
                    if (genData.image_url) {
                        const fullUrl = `http://localhost:3001${genData.image_url}`
                        setImagePreview(fullUrl)
                        setGeneratedImageUrl(genData.image_url)
                        setImageSource('generated')
                    }
                    // Delete temp character
                    await fetch(`http://localhost:3001/api/characters/${tempData.id}`, {
                        method: 'DELETE'
                    })

                    toaster.create({
                        title: 'AI生成成功',
                        type: 'success',
                    })
                } else {
                    throw new Error('Generation failed')
                }
            }
        } catch (error: any) {
            console.error('AI生成失败:', error)
            toaster.create({
                title: 'AI生成失败',
                description: error.message || '请稍后重试',
                type: 'error',
            })
        } finally {
            setGenerating(false)
        }
    }

    const handleAutoFill = async () => {
        // Validation: require prompt
        if (!formData.prompt.trim()) {
            toaster.create({
                title: '请先输入提示词',
                description: '自动填写需要提示词作为输入',
                type: 'error',
            })
            return
        }

        setAutoFilling(true)
        try {
            const response = await fetch('http://localhost:3001/api/characters/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: formData.prompt
                }),
            })

            if (response.ok) {
                const data = await response.json()
                // Update form fields with analyzed data
                setFormData({
                    ...formData,
                    name: data.name,
                    category: data.category,
                })
                setTags(data.tags.join(', '))

                toaster.create({
                    title: '自动填写成功',
                    description: '已根据提示词自动填充角色信息',
                    type: 'success',
                })
            } else {
                const errorData = await response.json()
                console.error('❌ 后端返回错误:', errorData)
                throw new Error(errorData.error || '分析失败')
            }
        } catch (error: any) {
            console.error('❌ 自动填写失败:', error)
            toaster.create({
                title: '自动填写失败',
                description: error.message || '请稍后重试',
                type: 'error',
                duration: 5000,
            })
        } finally {
            setAutoFilling(false)
        }
    }

    // Helper function to convert image to base64
    const convertImageToBase64 = async (imageUrl: string): Promise<{ data: string, mimeType: string }> => {
        const response = await fetch(imageUrl)
        const blob = await response.blob()
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onloadend = () => {
                const base64String = reader.result as string
                const base64Data = base64String.split(',')[1]
                resolve({
                    data: base64Data,
                    mimeType: blob.type || 'image/png'
                })
            }
            reader.onerror = reject
            reader.readAsDataURL(blob)
        })
    }

    const handleSave = async () => {
        if (!formData.name.trim()) {
            toaster.create({
                title: '请输入角色名称',
                type: 'warning',
            })
            return
        }

        setSaving(true)
        try {
            const filteredTags = tags.split(/[,，]/).map(tag => tag.trim()).filter(tag => tag !== '')
            const payload = {
                name: formData.name,
                prompt: formData.prompt,
                category: formData.category || null,
                tags: filteredTags,
            }

            const response = await fetch('http://localhost:3001/api/characters', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })

            if (response.ok) {
                const savedChar = await response.json()

                // Handle image based on source
                if (imageSource === 'uploaded' && imageFile) {
                    // Upload file
                    const formData = new FormData()
                    formData.append('file', imageFile)
                    await fetch(`http://localhost:3001/api/characters/${savedChar.id}/image`, {
                        method: 'POST',
                        body: formData,
                    })
                } else if (imageSource === 'generated' && generatedImageUrl) {
                    // Update character with generated image URL
                    await fetch(`http://localhost:3001/api/characters/${savedChar.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            ...payload,
                            image_url: generatedImageUrl
                        }),
                    })
                }

                toaster.create({
                    title: '角色创建成功',
                    type: 'success',
                })
                router.push('/workspace/characters')
            } else {
                throw new Error('保存失败')
            }
        } catch (error) {
            console.error('保存失败:', error)
            toaster.create({
                title: '保存失败',
                type: 'error',
            })
        } finally {
            setSaving(false)
        }
    }

    return (
        <MainLayout>
            <Container maxW="4xl" py={8}>
                <Stack gap={6}>
                    {/* 页头 */}
                    <Box>
                        <Heading size="xl" color="white">新增角色</Heading>
                    </Box>

                    {/* 表单 */}
                    <Stack
                        gap={6}
                        bg="whiteAlpha.50"
                        backdropFilter="blur(10px)"
                        border="1px solid"
                        borderColor="whiteAlpha.100"
                        p={8}
                        borderRadius="xl"
                    >
                        {/* 图片上传和提示词 - 左右布局 */}
                        <Flex gap={6} align="start">
                            {/* 左侧：图片上传 */}
                            <Box flexShrink={0}>
                                <Box
                                    w="300px"
                                    h="400px"
                                    bg="whiteAlpha.100"
                                    borderRadius="lg"
                                    border="2px dashed"
                                    borderColor="whiteAlpha.200"
                                    cursor="pointer"
                                    overflow="hidden"
                                    position="relative"
                                    _hover={{ borderColor: 'blue.500', bg: 'blackAlpha.400' }}
                                    onClick={() => !generating && fileInputRef.current?.click()}
                                >
                                    {imagePreview ? (
                                        <>
                                            <Image src={imagePreview} w="100%" h="100%" objectFit="cover" />
                                            <IconButton
                                                position="absolute"
                                                top={2}
                                                right={2}
                                                size="sm"
                                                colorPalette="red"
                                                aria-label="Remove image"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleRemoveImage()
                                                }}
                                            >
                                                <X size={16} />
                                            </IconButton>
                                        </>
                                    ) : (
                                        <Center h="100%" flexDirection="column" gap={3}>
                                            <Upload size={48} color="gray" />
                                            <Text color="gray.400" fontSize="lg">点击上传图片</Text>
                                            <Text color="gray.500" fontSize="sm">支持 JPG、PNG 格式</Text>
                                        </Center>
                                    )}
                                    <input
                                        type="file"
                                        hidden
                                        ref={fileInputRef}
                                        onChange={handleImageSelect}
                                        accept="image/*"
                                    />
                                </Box>
                            </Box>

                            {/* 右侧：提示词和AI按钮 */}
                            <Flex direction="column" flex={1} h="400px" justify="space-between">
                                <Box flex={1}>
                                    <Textarea
                                        value={formData.prompt}
                                        onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
                                        placeholder="输入角色生成的提示词，用于AI生成图片和自动填写信息..."
                                        bg="whiteAlpha.100"
                                        border="none"
                                        color="white"
                                        h="100%"
                                        resize="none"
                                        _focus={{ bg: 'whiteAlpha.200', ring: 1, ringColor: 'purple.500' }}
                                    />
                                </Box>

                                <Flex gap={3} mt={4}>
                                    <Button
                                        colorPalette="purple"
                                        onClick={handleAIGenerate}
                                        loading={generating}
                                        flex={1}
                                        size="lg"
                                    >
                                        <Sparkles size={20} style={{ marginRight: '8px' }} />
                                        {generating ? '生成中...' : (imagePreview ? '重新生成' : 'AI生成角色')}
                                    </Button>
                                    <Button
                                        colorPalette="blue"
                                        onClick={handleAutoFill}
                                        loading={autoFilling}
                                        flex={1}
                                        size="lg"
                                    >
                                        自动填写
                                    </Button>
                                </Flex>
                            </Flex>
                        </Flex>

                        {/* 角色名称和分类 - 一行显示 */}
                        <Flex gap={4}>
                            <Box flex={1}>
                                <Text fontSize="sm" fontWeight="semibold" color="white" mb={2}>角色名称 *</Text>
                                <Input
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="输入角色名称"
                                    bg="whiteAlpha.100"
                                    border="none"
                                    color="white"
                                    size="lg"
                                    _focus={{ bg: 'whiteAlpha.200', ring: 1, ringColor: 'blue.500' }}
                                />
                            </Box>
                            <Box flex={1}>
                                <Text fontSize="sm" fontWeight="semibold" color="white" mb={2}>分类</Text>
                                <Input
                                    value={formData.category}
                                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                    placeholder="例如: 主要角色"
                                    bg="whiteAlpha.100"
                                    border="none"
                                    color="white"
                                    size="lg"
                                    _focus={{ bg: 'whiteAlpha.200', ring: 1, ringColor: 'blue.500' }}
                                />
                            </Box>
                        </Flex>

                        {/* 标签 */}
                        <Box>
                            <Text fontSize="sm" fontWeight="semibold" color="white" mb={2}>标签</Text>
                            <Textarea
                                value={tags}
                                onChange={(e) => setTags(e.target.value)}
                                placeholder="输入标签，使用逗号分割多个标签"
                                bg="whiteAlpha.100"
                                border="none"
                                color="white"
                                rows={3}
                                resize="none"
                                _focus={{ bg: 'whiteAlpha.200', ring: 1, ringColor: 'blue.500' }}
                            />
                        </Box>

                        {/* 操作按钮 */}
                        <Flex gap={3} pt={4}>
                            <Button
                                colorPalette="blue"
                                size="lg"
                                onClick={handleSave}
                                loading={saving}
                                flex={1}
                            >
                                保存角色
                            </Button>
                            <Button
                                bg="whiteAlpha.200"
                                color="white"
                                _hover={{ bg: 'whiteAlpha.300' }}
                                size="lg"
                                onClick={() => router.push('/workspace/characters')}
                                disabled={saving}
                            >
                                取消
                            </Button>
                        </Flex>
                    </Stack>
                </Stack>
            </Container>
        </MainLayout>
    )
}
