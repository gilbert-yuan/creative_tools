export interface Style {
  id: string
  name: string
  description: string
  thumbnailUrl: string
  previewUrl: string
  tags: string[]
  category: string
  parameters?: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface StyleCategory {
  id: string
  name: string
  count: number
}

export type StyleFormData = Omit<Style, 'id' | 'createdAt' | 'updatedAt'>
