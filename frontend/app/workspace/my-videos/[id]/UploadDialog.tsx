import { useState, useRef } from 'react';
import {
    Box,
    Button,
    DialogRoot,
    DialogBackdrop,
    DialogContent,
    DialogHeader,
    DialogBody,
    DialogFooter,
    DialogCloseTrigger,
    DialogTitle,
    DialogActionTrigger,
    Text,
    Stack,
    Textarea,
    Image as ChakraImage,
} from '@chakra-ui/react';
import { Image as ImageIcon, Film as FilmIcon, Upload } from 'lucide-react';

interface UploadDialogProps {
    open: boolean;
    onClose: () => void;
    sceneId: number | null;
    projectId: string;
    type: 'image' | 'video';
    onSuccess: () => void;
}

export function UploadDialog({ open, onClose, sceneId, projectId, type, onSuccess }: UploadDialogProps) {
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadPrompt, setUploadPrompt] = useState('');
    const [uploading, setUploading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isImage = type === 'image';

    const validateAndSetFile = (file: File) => {
        // 验证文件类型
        const validImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
        const validVideoTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
        const validTypes = isImage ? validImageTypes : [...validImageTypes, ...validVideoTypes];

        if (!validTypes.includes(file.type)) {
            alert(`请选择有效的${isImage ? '图片' : '图片或视频'}文件`);
            return;
        }

        // 验证文件大小
        const maxSize = isImage ? 10 * 1024 * 1024 : 100 * 1024 * 1024; // 图片10MB，视频100MB
        if (file.size > maxSize) {
            alert(`文件大小不能超过 ${isImage ? '10MB' : '100MB'}`);
            return;
        }

        setUploadFile(file);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            validateAndSetFile(e.target.files[0]);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            validateAndSetFile(e.dataTransfer.files[0]);
        }
    };

    const handleSubmitUpload = async () => {
        if (!uploadFile || sceneId === null) return;

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', uploadFile);
            formData.append('prompt', uploadPrompt);
            formData.append('generation_type', type);

            const response = await fetch(
                `http://localhost:3001/api/projects/${projectId}/scenes/${sceneId}/upload`,
                {
                    method: 'POST',
                    body: formData,
                }
            );

            if (response.ok) {
                setUploadFile(null);
                setUploadPrompt('');
                onSuccess();
                onClose();
            } else {
                const error = await response.json();
                alert(`上传失败: ${error.error || '未知错误'}`);
            }
        } catch (error) {
            console.error('上传失败:', error);
            alert('上传失败，请重试');
        } finally {
            setUploading(false);
        }
    };

    const handleDialogClose = () => {
        setUploadFile(null);
        setUploadPrompt('');
        setIsDragging(false);
        onClose();
    };

    return (
        <DialogRoot
            open={open}
            onOpenChange={(e) => !e.open && handleDialogClose()}
            size="lg"
            lazyMount
            unmountOnExit
        >
            <DialogBackdrop />
            <DialogContent
                bg="gray.900"
                border="1px solid"
                borderColor="whiteAlpha.200"
                position="fixed"
                top="50%"
                left="50%"
                transform="translate(-50%, -50%)"
                maxW="600px"
                w="90vw"
                maxH="85vh"
                overflowY="auto"
            >
                <DialogHeader>
                    <DialogTitle color="white">
                        上传{isImage ? '图片' : '图片或视频'}
                    </DialogTitle>
                    <DialogCloseTrigger onClick={handleDialogClose} />
                </DialogHeader>

                <DialogBody>
                    <Stack gap={4}>
                        <Box
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            cursor="pointer"
                            border="2px dashed"
                            borderColor={isDragging ? 'blue.500' : uploadFile ? 'green.500' : 'whiteAlpha.200'}
                            bg={isDragging ? 'whiteAlpha.100' : 'transparent'}
                            borderRadius="md"
                            p={8}
                            textAlign="center"
                            transition="all 0.2s"
                            _hover={{ borderColor: 'blue.400', bg: 'whiteAlpha.50' }}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept={isImage ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"}
                                onChange={handleFileSelect}
                                style={{ display: 'none' }}
                            />
                            <Stack gap={3} align="center">
                                {uploadFile ? (
                                    <>
                                        <Box color="green.400">
                                            {uploadFile.type.startsWith('image/') ? <ImageIcon size={32} /> : <FilmIcon size={32} />}
                                        </Box>
                                        <Box>
                                            <Text fontWeight="medium" color="white">{uploadFile.name}</Text>
                                            <Text fontSize="xs" color="gray.400">
                                                {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
                                            </Text>
                                        </Box>
                                        <Text fontSize="xs" color="blue.300">点击更换文件</Text>
                                    </>
                                ) : (
                                    <>
                                        <Upload size={32} color="gray" />
                                        <Box>
                                            <Text fontWeight="medium" color="white">点击或拖拽文件到这里上传</Text>
                                            <Text fontSize="xs" color="gray.400" mt={1}>
                                                {isImage ? '支持 JPG, PNG, WebP (最大 10MB)' : '支持图片或视频 (最大 100MB)'}
                                            </Text>
                                        </Box>
                                    </>
                                )}
                            </Stack>
                        </Box>

                        <Box>
                            <Text fontSize="sm" fontWeight="medium" color="white" mb={2}>
                                提示词（可选）
                            </Text>
                            <Textarea
                                value={uploadPrompt}
                                onChange={(e) => setUploadPrompt(e.target.value)}
                                placeholder="输入提示词描述..."
                                bg="blackAlpha.300"
                                color="white"
                                border="1px solid"
                                borderColor="whiteAlpha.200"
                                _hover={{ borderColor: 'whiteAlpha.300' }}
                                _focus={{ borderColor: 'blue.500', boxShadow: 'none' }}
                                rows={4}
                            />
                        </Box>
                    </Stack>
                </DialogBody>

                <DialogFooter>
                    <DialogActionTrigger asChild>
                        <Button
                            bg="whiteAlpha.200"
                            color="white"
                            _hover={{ bg: 'whiteAlpha.300' }}
                            onClick={handleDialogClose}
                        >
                            取消
                        </Button>
                    </DialogActionTrigger>
                    <Button
                        colorPalette="blue"
                        onClick={handleSubmitUpload}
                        loading={uploading}
                        disabled={!uploadFile}
                    >
                        上传
                    </Button>
                </DialogFooter>
            </DialogContent>
        </DialogRoot>
    );
}
