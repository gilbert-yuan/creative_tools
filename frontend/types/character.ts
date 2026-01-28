export interface Character {
  id: string
  name: string
  description: string
  thumbnailUrl: string
  imageUrl: string
  tags: string[]
  category: string
  views: {
    front?: string
    side?: string
    back?: string
    color?: string
  }
  createdAt: string
  updatedAt: string
}

export interface CharacterCategory {
  id: string
  name: string
  count: number
}

export type CharacterFormData = Omit<Character, 'id' | 'createdAt' | 'updatedAt'>
