'use client'

import { Box, Container, Heading, Flex } from '@chakra-ui/react'
import Link from 'next/link'
import { Youtube } from 'lucide-react'

export default function Header() {
    return (
        <Box
            as="header"
            w="full"
            position="sticky"
            top={0}
            zIndex={100}
            bg="whiteAlpha.50"
            backdropFilter="blur(10px)"
            borderBottom="1px solid"
            borderColor="whiteAlpha.100"
        >
            <Container maxW="container.xl" py={4}>
                <Flex justify="space-between" align="center">
                    <Link href="/" style={{ textDecoration: 'none' }}>
                        <Flex align="center" gap={3}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" fill="#FF0000" />
                                <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="white" />
                            </svg>
                            <Heading size="md" color="white" _hover={{ color: 'blue.300', transition: 'color 0.2s' }}>
                                创作工具
                            </Heading>
                        </Flex>
                    </Link>
                </Flex>
            </Container>
        </Box>
    )
}
