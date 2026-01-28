import { Character, Style } from '@/types'

// 模拟角色数据
export const mockCharacters: Character[] = [
  {
    id: 'c1',
    name: 'K (主角)',
    category: '人类/改造人',
    tags: ['主角', '赏金猎人', '冷酷'],
    updatedAt: '2025-05-20',
    appearance: '一名30岁左右的男性，亚洲面孔，留着凌乱的黑色短发。身穿一件磨损严重的深灰色战术高领风衣，领口立起。左眼有一道细长的疤痕。左臂完全被替换为黑色的军用级机械义肢。',
    description: '以前是一个侦探，现在是赏金猎人。',
    views: [
      { color: 'blue.600' },
      { color: 'blue.700' },
      { color: 'blue.800' }
    ]
  },
  {
    id: 'c2',
    name: '暗影 (反派)',
    category: '改造人',
    tags: ['反派', '首领', '高科技'],
    updatedAt: '2025-05-21',
    appearance: '身材高大的赛博格，全身覆盖着黑红相间的纳米碳纤维护甲。头部大部分被金属头盔覆盖，双眼位置是两个发红光的电子传感器。',
    description: '地下组织的头目，追求力量的极致。',
    views: [
      { color: 'red.600' },
      { color: 'red.700' },
      { color: 'red.800' }
    ]
  },
  {
    id: 'c3',
    name: 'S-7 (助手)',
    category: '机器人',
    tags: ['辅助', '可爱', '悬浮'],
    updatedAt: '2025-05-18',
    appearance: '一个篮球大小的球形悬浮机器人。外壳是光滑的白色陶瓷材质，表面有极简的灰色线条装饰。',
    description: '负责情报分析的AI助手。',
    views: [
      { color: 'green.600' },
      { color: 'green.700' },
      { color: 'green.800' }
    ]
  },
  ...Array.from({ length: 18 }).map((_, i) => ({
    id: `mock_${i}`,
    name: `NPC 角色 ${i + 1}`,
    category: i % 3 === 0 ? '人类' : (i % 3 === 1 ? '机器人' : '怪物'),
    tags: ['配角', i % 2 === 0 ? '友善' : '敌对'],
    updatedAt: '2025-05-10',
    appearance: '标准赛博朋克路人装束，带有发光的配饰，面部有部分电子纹身。',
    description: '城市背景中的路人角色，为场景增添生活气息。',
    views: [
      { color: 'gray.600' },
      { color: 'gray.700' },
      { color: 'gray.800' }
    ]
  }))
]

// 模拟风格数据
export const mockStyles: Style[] = [
  {
    id: 's1',
    title: '赛博朋克霓虹',
    category: '科幻',
    tags: ['高对比度', '霓虹灯'],
    description: '强调蓝紫色的色调，强烈的霓虹灯光映照在潮湿的表面。',
    examples: ['purple.800', 'purple.900'],
    updatedAt: '2025-05-12'
  },
  {
    id: 's2',
    title: '废土废墟',
    category: '末世',
    tags: ['低饱和', '生锈'],
    description: '色调偏黄褐，强调材质的粗糙感、生锈的金属和破旧的织物。',
    examples: ['orange.800', 'orange.900'],
    updatedAt: '2025-04-20'
  },
  {
    id: 's3',
    title: '吉卜力清新',
    category: '动画',
    tags: ['水彩', '自然光'],
    description: '明亮清新的色彩，强调自然风景的细节，云朵和植被。',
    examples: ['blue.400', 'green.400'],
    updatedAt: '2025-06-01'
  }
]

// 模拟 API 延迟
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// 角色相关 API
export const characterService = {
  async getAll(params?: { search?: string; category?: string }): Promise<Character[]> {
    await delay(300)
    let results = [...mockCharacters]

    if (params?.search) {
      results = results.filter(c =>
        c.name.toLowerCase().includes(params.search!.toLowerCase()) ||
        c.description.toLowerCase().includes(params.search!.toLowerCase())
      )
    }

    if (params?.category && params.category !== 'all') {
      results = results.filter(c => c.category === params.category)
    }

    return results
  },

  async getById(id: string): Promise<Character | null> {
    await delay(200)
    return mockCharacters.find(c => c.id === id) || null
  },

  async create(character: Omit<Character, 'id' | 'updatedAt'>): Promise<Character> {
    await delay(500)
    const newCharacter: Character = {
      ...character,
      id: `c_${Date.now()}`,
      updatedAt: new Date().toISOString().split('T')[0]
    }
    mockCharacters.unshift(newCharacter)
    return newCharacter
  },

  async update(id: string, updates: Partial<Character>): Promise<Character | null> {
    await delay(500)
    const index = mockCharacters.findIndex(c => c.id === id)
    if (index === -1) return null

    mockCharacters[index] = {
      ...mockCharacters[index],
      ...updates,
      updatedAt: new Date().toISOString().split('T')[0]
    }
    return mockCharacters[index]
  },

  async delete(id: string): Promise<boolean> {
    await delay(300)
    const index = mockCharacters.findIndex(c => c.id === id)
    if (index === -1) return false
    mockCharacters.splice(index, 1)
    return true
  }
}

// 风格相关 API
export const styleService = {
  async getAll(params?: { search?: string; category?: string }): Promise<Style[]> {
    await delay(300)
    let results = [...mockStyles]

    if (params?.search) {
      results = results.filter(s =>
        s.title.toLowerCase().includes(params.search!.toLowerCase()) ||
        s.description.toLowerCase().includes(params.search!.toLowerCase())
      )
    }

    if (params?.category && params.category !== 'all') {
      results = results.filter(s => s.category === params.category)
    }

    return results
  },

  async getById(id: string): Promise<Style | null> {
    await delay(200)
    return mockStyles.find(s => s.id === id) || null
  },

  async create(style: Omit<Style, 'id' | 'updatedAt'>): Promise<Style> {
    await delay(500)
    const newStyle: Style = {
      ...style,
      id: `s_${Date.now()}`,
      updatedAt: new Date().toISOString().split('T')[0]
    }
    mockStyles.unshift(newStyle)
    return newStyle
  },

  async update(id: string, updates: Partial<Style>): Promise<Style | null> {
    await delay(500)
    const index = mockStyles.findIndex(s => s.id === id)
    if (index === -1) return null

    mockStyles[index] = {
      ...mockStyles[index],
      ...updates,
      updatedAt: new Date().toISOString().split('T')[0]
    }
    return mockStyles[index]
  },

  async delete(id: string): Promise<boolean> {
    await delay(300)
    const index = mockStyles.findIndex(s => s.id === id)
    if (index === -1) return false
    mockStyles.splice(index, 1)
    return true
  }
}

// 视频虚拟剪辑 API
export interface VideoInfo {
  duration: number
  width: number
  height: number
  fps: number
}

export interface Scene {
  index: number
  startTime: number
  endTime: number
  duration: number
  startTimestamp: string
  endTimestamp: string
  videoUrl: string
  frameCount: number
}

export interface VirtualCutResponse {
  job_id: string
  video_info: VideoInfo
  total_scenes: number
  scenes: Scene[]
  video_url: string
  youtube_url?: string
  original_filename: string
}

export interface JobItem {
  id: string
  original_filename: string
  file_size_bytes: number
  duration_seconds?: number
  status: string
  created_at: string
  updated_at: string
}

export const videoService = {
  async virtualCut(file: File, onProgress?: (progress: number) => void): Promise<VirtualCutResponse> {
    const formData = new FormData()
    formData.append('video', file)

    console.log('[API] 开始上传:', file.name, `${(file.size / 1024 / 1024).toFixed(2)} MB`)

    // 创建带超时的 fetch
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort()
      console.log('[API] 请求超时')
    }, 120000) // 120秒超时

    try {
      const response = await fetch('http://localhost:3001/api/video/virtual-cut', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      console.log('[API] 收到响应:', response.status, response.statusText)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[API] 错误响应:', errorText)
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()
      console.log('[API] 解析成功:', result.total_scenes, '个场景, job_id:', result.job_id)
      return result
    } catch (error: any) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') {
        throw new Error('请求超时，请检查网络连接或尝试更小的视频文件')
      }
      throw error
    }
  },

  async getResult(jobId: string): Promise<VirtualCutResponse> {
    console.log('[API] 获取分析结果:', jobId)

    const response = await fetch(`http://localhost:3001/api/result/${jobId}`)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[API] 获取结果失败:', errorText)
      throw new Error(`Failed to get result: ${response.status}`)
    }

    const result = await response.json()
    console.log('[API] 结果获取成功:', result.total_scenes, '个场景')
    return result
  },

  async getJobs(limit: number = 20, offset: number = 0): Promise<JobItem[]> {
    console.log('[API] 获取历史记录:', { limit, offset })

    const response = await fetch(`http://localhost:3001/api/jobs?limit=${limit}&offset=${offset}`)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[API] 获取历史记录失败:', errorText)
      throw new Error(`Failed to get jobs: ${response.status}`)
    }

    const result = await response.json()
    console.log('[API] 历史记录获取成功:', result.length, '条记录')
    return result
  },

  async reanalyzeJob(jobId: string): Promise<{ message: string; job_id: string }> {
    console.log('[API] 重新分析任务:', jobId)

    const response = await fetch(`http://localhost:3001/api/jobs/${jobId}/reanalyze`, {
      method: 'POST'
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[API] 重新分析失败:', errorText)
      throw new Error(`Failed to reanalyze job: ${response.status}`)
    }

    const result = await response.json()
    console.log('[API] 重新分析已启动')
    return result
  },

  async youtubeVirtualCut(url: string): Promise<VirtualCutResponse> {
    console.log('[API] YouTube 视频下载:', url)

    const response = await fetch('http://localhost:3001/api/video/youtube-cut', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('[API] YouTube 下载失败:', error)
      throw new Error(error.error || 'YouTube 视频下载失败')
    }

    const result = await response.json()
    console.log('[API] YouTube 下载成功:', result.total_scenes, '个场景, job_id:', result.job_id)
    return result
  },

  async updateScenes(jobId: string, scenes: Scene[]): Promise<{ message: string; updated_count: number }> {
    console.log('[API] 更新场景:', jobId, scenes.length, '个场景')

    const response = await fetch(`http://localhost:3001/api/jobs/${jobId}/scenes`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scenes }),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('[API] 更新场景失败:', error)
      throw new Error(error.error || '场景更新失败')
    }

    const result = await response.json()
    console.log('[API] 场景更新成功')
    return result
  },

  async physicalSplit(jobId: string): Promise<{ message: string; split_count: number; output_directory: string }> {
    console.log('[API] 物理切分视频:', jobId)

    const response = await fetch(`http://localhost:3001/api/jobs/${jobId}/split`, {
      method: 'POST',
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('[API] 物理切分失败:', error)
      throw new Error(error.error || '视频切分失败')
    }

    const result = await response.json()
    console.log('[API] 视频切分成功:', result.split_count, '个文件')
    return result
  },

  async deleteJob(jobId: string): Promise<{ message: string; job_id: string }> {
    console.log('[API] 删除任务:', jobId)

    const response = await fetch(`http://localhost:3001/api/jobs/${jobId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('[API] 删除任务失败:', error)
      throw new Error(error.error || '删除失败')
    }

    const result = await response.json()
    console.log('[API] 任务删除成功')
    return result
  },

  async openInFinder(filePath: string): Promise<{ success: boolean; message: string }> {
    console.log('[API] 在Finder中打开:', filePath)

    const response = await fetch('http://localhost:3001/api/files/reveal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file_path: filePath }),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('[API] 打开Finder失败:', error)
      throw new Error(error.error || '打开Finder失败')
    }

    const result = await response.json()
    console.log('[API] Finder已打开')
    return result
  }
}
