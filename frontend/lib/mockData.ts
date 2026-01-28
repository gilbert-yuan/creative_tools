import { Character, CharacterCategory } from '@/types/character'
import { Style, StyleCategory } from '@/types/style'

// 模拟角色数据
export const mockCharacters: Character[] = [
  {
    id: 'c5',
    name: '蓝光机器人',
    description: '全金属机械身体，配有蓝色发光眼睛和橙色装饰细节。胸前配备摄像系统，全身关节可灵活转动。外壳采用银蓝色涂装，具有未来科技感。适用于科幻、科技主题的视频制作。',
    thumbnailUrl: '/robot.png',
    imageUrl: '/robot.png',
    tags: ['机器人', '科技', '蓝色'],
    category: '机械角色',
    views: {
      color: '#60A5FA'
    },
    createdAt: '2025-12-28',
    updatedAt: '2025-12-28',
  },
  {
    id: 'c1',
    name: 'K (主角)',
    description: '一名30岁左右的男性、亚洲面孔。留着透乱的黑色短发。身穿一件磨损严重的深灰色战术高领风衣。领口立起。左眼有一道细微的伤疤。右手臂上有复杂的机械纹身，隐约发光...',
    thumbnailUrl: '',
    imageUrl: '',
    tags: ['人类/改造人'],
    category: '人物',
    views: {
      color: '#3B82F6'
    },
    createdAt: '2025-05-20',
    updatedAt: '2025-05-20',
  },
  {
    id: 'c2',
    name: '暗影 (反派)',
    description: '身材高大的赛博格。全身覆盖着黑红相间的纳米碳纤维护甲。头部大部分被金属头盔覆盖。双眼位置是两个发红光的电子传感器。声音低沉且带有电子失真...',
    thumbnailUrl: '',
    imageUrl: '',
    tags: ['改造人'],
    category: '人物',
    views: {
      color: '#EF4444'
    },
    createdAt: '2025-05-21',
    updatedAt: '2025-05-21',
  },
  {
    id: 'c3',
    name: '艾娃 (女主)',
    description: '25岁左右的女性黑客。短发，染成银白色。穿着黑色紧身衣，外罩一件带发光线路的智能夹克。左耳佩戴多个电子耳环，可实时显示数据...',
    thumbnailUrl: '',
    imageUrl: '',
    tags: ['人类'],
    category: '人物',
    views: {
      color: '#8B5CF6'
    },
    createdAt: '2025-05-22',
    updatedAt: '2025-05-22',
  },
  {
    id: 'c4',
    name: '老狐狸 (导师)',
    description: '60岁的退役军官，满脸沧桑。灰白的短发梳理整齐。左眼是义眼，偶尔会闪烁红光。穿着改装的军用外套，内衬防弹背心...',
    thumbnailUrl: '',
    imageUrl: '',
    tags: ['人类/改造人'],
    category: '人物',
    views: {
      color: '#10B981'
    },
    createdAt: '2025-05-23',
    updatedAt: '2025-05-23',
  },
]

export const mockCharacterCategories: CharacterCategory[] = [
  { id: '1', name: '全部', count: 5 },
  { id: '2', name: '人物', count: 4 },
  { id: '3', name: '机械角色', count: 1 },
]

// 模拟风格数据
export const mockStyles: Style[] = [
  {
    id: '1',
    name: '赛博朋克',
    description: '未来科技感的霓虹风格，充满都市感',
    thumbnailUrl: '/styles/cyberpunk.jpg',
    previewUrl: '/styles/cyberpunk.jpg',
    tags: ['科技', '未来', '霓虹'],
    category: '科幻',
    parameters: { brightness: 1.2, contrast: 1.5, saturation: 1.3 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '2',
    name: '吉卜力',
    description: '宫崎骏风格的治愈系动画，清新自然',
    thumbnailUrl: '/styles/ghibli.jpg',
    previewUrl: '/styles/ghibli.jpg',
    tags: ['动漫', '宫崎骏', '清新'],
    category: '动漫',
    parameters: { brightness: 1.1, saturation: 1.2 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '3',
    name: '美漫',
    description: '经典美式漫画风格，线条硬朗，色彩鲜艳',
    thumbnailUrl: '/styles/comic.jpg',
    previewUrl: '/styles/comic.jpg',
    tags: ['漫画', '美式', '英雄'],
    category: '复古',
    parameters: { grain: 0.1, contrast: 1.4, saturation: 1.4 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '4',
    name: '皮克斯',
    description: '3D动画电影风格，质感细腻，灯光柔和',
    thumbnailUrl: '/styles/pixar.jpg',
    previewUrl: '/styles/pixar.jpg',
    tags: ['3D', '动画', '可爱'],
    category: '艺术',
    parameters: { blur: 0.0, softness: 1.1 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]

export const mockStyleCategories: StyleCategory[] = [
  { id: '1', name: '全部', count: 4 },
  { id: '2', name: '科幻', count: 1 },
  { id: '3', name: '动漫', count: 1 },
  { id: '4', name: '复古', count: 1 },
  { id: '5', name: '艺术', count: 1 },
]
