'use client'

import { Box, Container, Text, SimpleGrid, Stack, Flex } from '@chakra-ui/react'
import { Users, Palette, Video, Clapperboard, BookImage } from 'lucide-react'
import Link from 'next/link'
import MainLayout from '@/components/MainLayout'

export default function WorkspacePage() {
  return (
    <MainLayout>
      <Container maxW="7xl" py={12}>
        <Stack gap={8}>


          <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={4}>
            {/* 视频拆解卡片 */}
            <Link href="/workspace/video-analysis">
              <Box
                bg="whiteAlpha.50"
                backdropFilter="blur(10px)"
                borderRadius="lg"
                border="1px"
                borderColor="whiteAlpha.100"
                p={5}
                _hover={{
                  borderColor: 'green.400',
                  transform: 'translateY(-2px)',
                  bg: 'whiteAlpha.100'
                }}
                transition="all 0.2s"
                cursor="pointer"
                h="full"
              >
                <Flex
                  w={12}
                  h={12}
                  bg="green.400"
                  css={{ '--chakra-colors-green-400': 'rgba(74, 222, 128, 0.2)' }}
                  borderRadius="md"
                  align="center"
                  justify="center"
                  mb={3}
                  border="1px solid"
                  borderColor="green.500"
                >
                  <Video size={24} color="#4ade80" />
                </Flex>
                <Text color="white" fontSize="lg" fontWeight="semibold">
                  视频拆解
                </Text>
              </Box>
            </Link>

            {/* 我的短视频卡片 */}
            <Link href="/workspace/my-videos">
              <Box
                bg="whiteAlpha.50"
                backdropFilter="blur(10px)"
                borderRadius="lg"
                border="1px"
                borderColor="whiteAlpha.100"
                p={5}
                _hover={{
                  borderColor: 'orange.400',
                  transform: 'translateY(-2px)',
                  bg: 'whiteAlpha.100'
                }}
                transition="all 0.2s"
                cursor="pointer"
                h="full"
              >
                <Flex
                  w={12}
                  h={12}
                  bg="orange.400"
                  css={{ '--chakra-colors-orange-400': 'rgba(251, 146, 60, 0.2)' }}
                  borderRadius="md"
                  align="center"
                  justify="center"
                  mb={3}
                  border="1px solid"
                  borderColor="orange.500"
                >
                  <Clapperboard size={24} color="#fb923c" />
                </Flex>
                <Text color="white" fontSize="lg" fontWeight="semibold">
                  我的短视频
                </Text>
              </Box>
            </Link>

            {/* 我的漫画卡片 */}
            <Link href="/workspace/my-comics">
              <Box
                bg="whiteAlpha.50"
                backdropFilter="blur(10px)"
                borderRadius="lg"
                border="1px"
                borderColor="whiteAlpha.100"
                p={5}
                _hover={{
                  borderColor: 'pink.400',
                  transform: 'translateY(-2px)',
                  bg: 'whiteAlpha.100'
                }}
                transition="all 0.2s"
                cursor="pointer"
                h="full"
              >
                <Flex
                  w={12}
                  h={12}
                  bg="pink.400"
                  css={{ '--chakra-colors-pink-400': 'rgba(244, 114, 182, 0.2)' }}
                  borderRadius="md"
                  align="center"
                  justify="center"
                  mb={3}
                  border="1px solid"
                  borderColor="pink.500"
                >
                  <BookImage size={24} color="#f472b6" />
                </Flex>
                <Text color="white" fontSize="lg" fontWeight="semibold">
                  我的漫画
                </Text>
              </Box>
            </Link>

            {/* 角色库卡片 */}
            <Link href="/workspace/characters">
              <Box
                bg="whiteAlpha.50"
                backdropFilter="blur(10px)"
                borderRadius="lg"
                border="1px"
                borderColor="whiteAlpha.100"
                p={5}
                _hover={{
                  borderColor: 'blue.400',
                  transform: 'translateY(-2px)',
                  bg: 'whiteAlpha.100'
                }}
                transition="all 0.2s"
                cursor="pointer"
                h="full"
              >
                <Flex
                  w={12}
                  h={12}
                  bg="blue.400"
                  css={{ '--chakra-colors-blue-400': 'rgba(96, 165, 250, 0.2)' }}
                  borderRadius="md"
                  align="center"
                  justify="center"
                  mb={3}
                  border="1px solid"
                  borderColor="blue.500"
                >
                  <Users size={24} color="#60a5fa" />
                </Flex>
                <Text color="white" fontSize="lg" fontWeight="semibold">
                  角色库
                </Text>
              </Box>
            </Link>

            {/* 风格库卡片 */}
            <Link href="/workspace/styles">
              <Box
                bg="whiteAlpha.50"
                backdropFilter="blur(10px)"
                borderRadius="lg"
                border="1px"
                borderColor="whiteAlpha.100"
                p={5}
                _hover={{
                  borderColor: 'purple.400',
                  transform: 'translateY(-2px)',
                  bg: 'whiteAlpha.100'
                }}
                transition="all 0.2s"
                cursor="pointer"
                h="full"
              >
                <Flex
                  w={12}
                  h={12}
                  bg="purple.400"
                  css={{ '--chakra-colors-purple-400': 'rgba(192, 132, 252, 0.2)' }}
                  borderRadius="md"
                  align="center"
                  justify="center"
                  mb={3}
                  border="1px solid"
                  borderColor="purple.500"
                >
                  <Palette size={24} color="#c084fc" />
                </Flex>
                <Text color="white" fontSize="lg" fontWeight="semibold">
                  风格库
                </Text>
              </Box>
            </Link>
          </SimpleGrid>
        </Stack>
      </Container>
    </MainLayout>
  )
}
