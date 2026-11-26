import { callProfiles } from './profiles'

// Elsewhere Creative Exchange + Community Showcase + Trust (supabase/15_creative_exchange.sql).

export const DEPARTMENTS = {
  layout: { label: 'Layout Library', icon: '🏠', about: 'Whole profile designs to apply to your draft' },
  widget: { label: 'Widget Workshop', icon: '🧩', about: 'Interactive gadgets for your page' },
  skin: { label: 'Skin Gallery', icon: '💅', about: 'Messenger skins (.eskin)' },
  decoration: { label: 'Decoration Shop', icon: '✿', about: 'Stickers, stamps, blinkies and sprites (all free)' },
  style: { label: 'Style Collections', icon: '🎨', about: 'Color palettes and fonts' },
  code: { label: 'Code Corner', icon: '</>', about: 'HTML, CSS and JavaScript snippets' },
} as const
export type Department = keyof typeof DEPARTMENTS
export const LICENSES = {
  personal: 'Personal use only',
  remix: 'Personal use + remix with credit',
  share: 'Remix and share with credit',
  'cc-by': 'Creative Commons BY (credit required)',
} as const
export const SHOWCASE_CATEGORIES = {
  studio: 'Creative Studio', skin: 'Skins', doll: 'Pixel Dolls', profile: 'Profile designs', widget: 'Widgets & gadgets', wallpaper: 'Wallpapers', treasure: 'Web Treasures', other: 'Other',
} as const
export type ShowcaseCategory = keyof typeof SHOWCASE_CATEGORIES
export const REPORT_CATEGORIES = {
  malicious: 'Harmful or malicious code', stolen: 'Stolen work', impersonation: 'Pretending to be someone', misleading: 'Misleading listing',
  harassment: 'Harassment', spam: 'Spam', privacy: 'Shares private information', prohibited: 'Not allowed content', other: 'Something else',
} as const

type Creator = { handle: string; display_name: string }
export type ResourceCard = {
  id: string; kind: Department; title: string; description: string; tags: string[]; license: keyof typeof LICENSES; remix: boolean
  visibility: 'private' | 'unlisted' | 'public'; status: 'published' | 'restricted' | 'withdrawn'; version: string; preview: string
  has_code: boolean; official: boolean; downloads: number; favorites: number; updated_at: string; creator: Creator
  parent: { id: string; title: string; creator: string } | null
}
export type Resource = ResourceCard & { missing?: boolean; changelog: string; package: unknown; mine: boolean; favorite: boolean }
export type ShowcaseCard = {
  id: string; category: ShowcaseCategory; title: string; description: string; tags: string[]; image: string
  visibility: 'private' | 'friends' | 'unlisted' | 'public'; allow_comments: boolean; status: string; created_at: string; resource: string | null
  hearts: number; hearted: boolean; creator: Creator
}
export type ShowcasePost = ShowcaseCard & { missing?: boolean; mine: boolean; comments: { id: string; body: string; created_at: string; handle: string; display_name: string; mine: boolean }[] }
export type Report = { id: string; target_kind: string; target_id: string; category: keyof typeof REPORT_CATEGORIES; details: string; status: string; resolution: string; created_at: string; reporter?: string }

export const listResources = (kind?: Department, query = '', tag = '', sort = 'newest', page = 0) =>
  callProfiles<ResourceCard[]>('list_elsewhere_resources', { kind: kind || null, query, tag: tag || null, sort, page })
export const getResource = (id: string) => callProfiles<Resource>('get_elsewhere_resource', { resource_id: id })
export const countDownload = (id: string) => callProfiles<void>('count_elsewhere_resource_download', { resource_id: id })
export const setFavorite = (id: string, keep: boolean) => callProfiles<void>('set_elsewhere_resource_favorite', { resource_id: id, keep })
export const myCollection = () => callProfiles<{ favorites: ResourceCard[]; mine: ResourceCard[]; showcase: ShowcaseCard[] }>('my_elsewhere_collection')
export const saveResource = (r: { id?: string; kind: Department; title: string; description: string; tags: string[]; license: string; remix: boolean; visibility: string; version: string; changelog: string; package: unknown; preview: string; parent?: string | null }) =>
  callProfiles<string>('save_elsewhere_resource', { resource_id: r.id || null, kind: r.kind, title: r.title, description: r.description, tags: r.tags, license: r.license, remix: r.remix,
    visibility: r.visibility, version: r.version, changelog: r.changelog, package: r.package, preview: r.preview, parent: r.parent || null })
export const withdrawResource = (id: string) => callProfiles<void>('withdraw_elsewhere_resource', { resource_id: id })

export const listShowcase = (category?: ShowcaseCategory, query = '', sort = 'newest', page = 0) =>
  callProfiles<ShowcaseCard[]>('list_elsewhere_showcase', { category: category || null, query, sort, page })
export const getShowcase = (id: string) => callProfiles<ShowcasePost>('get_elsewhere_showcase', { post_id: id })
export const postShowcase = (p: { category: ShowcaseCategory; title: string; description: string; tags: string[]; image: string; visibility: string; allow_comments: boolean; resource?: string | null }) =>
  callProfiles<string>('post_elsewhere_showcase', { category: p.category, title: p.title, description: p.description, tags: p.tags, image: p.image, visibility: p.visibility, allow_comments: p.allow_comments, resource: p.resource || null })
export const updateShowcase = (id: string, visibility: string, allowComments: boolean) => callProfiles<void>('update_elsewhere_showcase', { post_id: id, visibility, allow_comments: allowComments })
export const deleteShowcase = (id: string) => callProfiles<void>('delete_elsewhere_showcase', { post_id: id })
export const setHeart = (id: string, keep: boolean) => callProfiles<void>('set_elsewhere_showcase_heart', { post_id: id, keep })
export const commentShowcase = (id: string, body: string) => callProfiles<void>('comment_elsewhere_showcase', { post_id: id, body })
export const removeComment = (id: string) => callProfiles<void>('remove_elsewhere_showcase_comment', { comment_id: id })
export const getCreator = (handle: string) => callProfiles<{ status: string; handle: string; display_name: string; resources: ResourceCard[]; showcase: ShowcaseCard[] }>('get_elsewhere_creator', { target_handle: handle })

export const report = (kind: 'resource' | 'showcase' | 'comment' | 'profile', id: string, category: keyof typeof REPORT_CATEGORIES, details: string) =>
  callProfiles<string>('report_elsewhere', { target_kind: kind, target_id: id, category, details })
export const myReports = () => callProfiles<Report[]>('my_elsewhere_reports')
export const amModerator = () => callProfiles<boolean>('am_elsewhere_moderator')
export const listReports = (onlyOpen = true) => callProfiles<Report[]>('list_elsewhere_reports', { only_open: onlyOpen })
export const actOnReport = (id: string, action: 'review' | 'dismiss' | 'restrict' | 'remove', note: string) => callProfiles<void>('act_elsewhere_report', { report_id: id, action, note })
export const restoreItem = (kind: string, id: string) => callProfiles<void>('restore_elsewhere_item', { target_kind: kind, target_id: id })
