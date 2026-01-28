export interface Character {
  id: string
  name: string
  category: string
  tags: string[]
  updatedAt: string
  appearance: string
  description: string
  views: Array<{ color: string }>
}

export interface Style {
  id: string
  title: string
  category: string
  tags: string[]
  description: string
  examples: string[]
  updatedAt: string
}

export interface User {
  id: string
  name: string
  email: string
  picture?: string
}
