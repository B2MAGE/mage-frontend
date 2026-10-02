import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from './HomePage'
import { APP_THEME_STORAGE_KEY, ThemeProvider, type AppThemeId } from '@theme'
import { fetchScenes, fetchTags } from '@shared/lib'
import { fetchSceneDetail, updateSceneVote } from '../scene-detail/loaders'
import type { SceneEngagementSummary } from '../scene-detail/types'

let authState = { isAuthenticated:false, isRestoringSession:false, authenticatedFetch:vi.fn() }
vi.mock('@auth',()=>({useAuth:()=>authState}))
vi.mock('@shared/lib',async original=>({ ...await original<typeof import('@shared/lib')>(), fetchScenes:vi.fn(), fetchTags:vi.fn() }))
vi.mock('../scene-detail/loaders',()=>({fetchSceneDetail:vi.fn(),updateSceneVote:vi.fn(),clearSceneVote:vi.fn(),updateSceneSave:vi.fn()}))
vi.mock('@modules/player',()=>({MagePlayer:()=> <div>Live featured player</div>}))
vi.mock('@modules/scene-artwork',()=>({
 BrandScene:({reactToBeat,className}:{reactToBeat?:boolean;className?:string})=> <div data-testid="welcome-brand-scene" className={className} data-react-to-beat={String(reactToBeat)} />,
}))
const engagement={views:18,upvotes:4,downvotes:0,saves:2,currentUserVote:null,currentUserSaved:false}
const scene={sceneId:1,ownerUserId:1,creatorDisplayName:'Ari Rivera',creatorHandle:'aririvera',creatorAvatarGradientStart:'#ab6645',creatorAvatarGradientEnd:'#663d54',name:'Neon Bloom',description:'A reactive scene.',thumbnailRef:null,sceneData:{},createdAt:'2026-09-20T00:00:00Z',engagement}
function show(themeId: AppThemeId = 'mage-pulse') {
 window.localStorage.setItem(APP_THEME_STORAGE_KEY, themeId)
 return render(<MemoryRouter><ThemeProvider><HomePage/></ThemeProvider></MemoryRouter>)
}
describe('Homepage mockup behavior',()=>{
 afterEach(()=>vi.unstubAllEnvs())
 beforeEach(()=>{
  vi.clearAllMocks()
  vi.stubEnv('VITE_HOME_FEATURED_SCENE_ID','1')
  authState={isAuthenticated:false,isRestoringSession:false,authenticatedFetch:vi.fn()}
  vi.mocked(fetchScenes).mockResolvedValue([scene,{...scene,sceneId:2,name:'Newest scene',createdAt:'2026-09-28T00:00:00Z'}])
  vi.mocked(fetchTags).mockResolvedValue([{tagId:1,name:'Ambient',sceneCount:3}])
  vi.mocked(fetchSceneDetail).mockResolvedValue({...scene,id:1,tags:['Ambient'],sceneData:{}})
 })
 it('uses layout skeletons for featured, filters, and recent scenes',()=>{
  vi.mocked(fetchScenes).mockImplementation(()=>new Promise(()=>{}))
  vi.mocked(fetchTags).mockImplementation(()=>new Promise(()=>{}))
  vi.mocked(fetchSceneDetail).mockImplementation(()=>new Promise(()=>{}))
  const {container}=show()
  expect(screen.getByText('Loading featured scene')).toHaveAttribute('role','status')
  expect(screen.getByText('Loading scene filters')).toHaveAttribute('role','status')
  expect(screen.getByText('Loading recent scenes')).toHaveAttribute('role','status')
  expect(container.querySelector('.featured-scene--loading')).toBeInTheDocument()
  expect(container.querySelector('.featured-loading__avatar')).not.toHaveClass('user-avatar')
  expect(container.querySelector('.featured-scene--loading .user-avatar')).not.toBeInTheDocument()
  expect(container.querySelector('.scene-card--loading .user-avatar')).not.toBeInTheDocument()
  expect(container.querySelector('.home-filter-loading__placeholder')).toBeInTheDocument()
  expect(container.querySelectorAll('.scene-card--loading')).toHaveLength(8)
  expect(container.querySelector('.tag-pill--skeleton')).not.toBeInTheDocument()
 })
 it('shows the welcome panel to guests and links featured browsing to scenes',async()=>{
  show()
  expect(screen.getByRole('heading',{name:'Build something that reacts.'})).toBeInTheDocument()
  expect(screen.getByTestId('welcome-brand-scene')).toHaveAttribute('data-react-to-beat','false')
  expect(screen.getByTestId('welcome-brand-scene')).toHaveClass('editor-brand-scene')
  expect(screen.getByTestId('welcome-brand-scene').closest('.editor-canvas')).toBeInTheDocument()
  expect(screen.getByRole('link',{name:/Sign up/})).toHaveAttribute('href','/register')
  expect(screen.getByRole('link',{name:/Browse all featured/})).toHaveAttribute('href','/scenes?sort=featured')
  expect(await screen.findByText('Live featured player')).toBeInTheDocument()
  expect(screen.getByRole('link',{name:/Ari Rivera@aririvera/})).toHaveAttribute('href','/@aririvera')
  expect(screen.getByRole('link',{name:/Ari Rivera@aririvera/}).querySelector('.creator-avatar')).toHaveClass('user-avatar')
  expect(screen.getByRole('link',{name:/Ari Rivera@aririvera/}).querySelector('.creator-avatar')).toHaveStyle({backgroundImage:'linear-gradient(145deg, #ab6645, #663d54)'})
  const discoveryAvatars=screen.getByLabelText('For You scenes').querySelectorAll('.scene-card__avatar')
  expect(discoveryAvatars).toHaveLength(2)
  discoveryAvatars.forEach(avatar=>{
   expect(avatar).toHaveClass('user-avatar')
   expect(avatar).toHaveStyle({backgroundImage:'linear-gradient(145deg, #ab6645, #663d54)'})
   expect(avatar).toHaveAttribute('aria-hidden','true')
  })
  expect(screen.queryByText('Scene creator')).not.toBeInTheDocument()
  expect(within(screen.getByRole('heading',{name:'Neon Bloom',level:2})).getByRole('link')).toHaveAttribute('href','/scenes/1')
  expect(screen.getByRole('link',{name:/Open scene/})).toHaveAttribute('href','/scenes/1')
  expect(screen.getByRole('link',{name:/See all recommended/})).toHaveAttribute('href','/scenes?sort=recommended')
 })
 it('uses the shared category pill style for featured tags and For You filters',async()=>{
  show()
  const featuredSection=screen.getByRole('region',{name:'Featured Scenes'})
  const featuredTag=await within(featuredSection).findByRole('link',{name:'Ambient'})
  const filters=within(await screen.findByLabelText('Filter recent scenes'))
  const allFilter=filters.getByRole('button',{name:'All'})
  const ambientFilter=filters.getByRole('button',{name:'Ambient'})
  expect(featuredTag).toHaveClass('tag-pill')
  expect(allFilter).toHaveClass('tag-pill','tag-pill--active')
  expect(ambientFilter).toHaveClass('tag-pill')
  expect(ambientFilter).not.toHaveClass('tag-pill--active')
 })
 it('keeps the homepage content for signed-in users but hides the welcome panel',async()=>{
  authState.isAuthenticated=true
  show()
  expect(screen.queryByRole('heading',{name:'Build something that reacts.'})).not.toBeInTheDocument()
  expect(screen.queryByTestId('welcome-brand-scene')).not.toBeInTheDocument()
  expect(await screen.findByText('Live featured player')).toBeInTheDocument()
  expect(screen.getByRole('heading',{name:'Featured Scenes'})).toBeInTheDocument()
  expect(screen.getByRole('heading',{name:'For You'})).toBeInTheDocument()
 })
 it('uses the shared SVG reaction icons for the featured scene',async()=>{
  show()
  await screen.findByText('Live featured player')
  const upvote=screen.getByRole('button',{name:'Upvote featured scene'})
  const downvote=screen.getByRole('button',{name:'Downvote featured scene'})
  const save=screen.getByRole('button',{name:'Save featured scene'})
  expect(upvote.querySelector('.engagement-button__icon svg')).toBeInTheDocument()
  expect(downvote.querySelector('.engagement-button__icon svg')).toBeInTheDocument()
  expect(save.querySelector('.engagement-button__icon svg')).toBeInTheDocument()
  expect(save.querySelector('.engagement-button__icon svg')).toHaveAttribute('fill','none')
 })
 it('keeps the featured reaction content in place while a vote is pending',async()=>{
  let resolveVote!: (value: SceneEngagementSummary)=>void
  vi.mocked(updateSceneVote).mockImplementation(()=>new Promise(resolve=>{ resolveVote=resolve }))
  authState.isAuthenticated=true
  show()
  await screen.findByText('Live featured player')
  const upvote=screen.getByRole('button',{name:'Upvote featured scene'})
  const content=upvote.querySelector('.engagement-button__content')
  const icon=upvote.querySelector('.engagement-button__icon')
  const count=upvote.querySelector('.engagement-button__count')
  fireEvent.click(upvote)
  expect(upvote).toHaveAttribute('aria-busy','true')
  expect(upvote).toBeDisabled()
  expect(upvote.querySelector('.engagement-button__content')).toBe(content)
  expect(upvote.querySelector('.engagement-button__icon')).toBe(icon)
  expect(upvote.querySelector('.engagement-button__count')).toBe(count)
  expect(count).toHaveTextContent('4')
  expect(upvote.querySelector('.engagement-button__spinner')).toBeInTheDocument()
  await act(async()=>{ resolveVote({...engagement,upvotes:5,currentUserVote:'up'}) })
  await waitFor(()=>expect(upvote).toHaveAttribute('aria-busy','false'))
  expect(upvote.querySelector('.engagement-button__count')).toBe(count)
  expect(count).toHaveTextContent('5')
 })
 it('sorts For You scenes newest first',async()=>{
  show()
  await screen.findByText('Live featured player')
  const titles=within(screen.getByLabelText('For You scenes')).getAllByRole('heading').map(node=>node.textContent)
  expect(titles).toEqual(['Newest scene','Neon Bloom'])
 })
 it('shows All followed by the four most-used database tags with alphabetical ties',async()=>{
  vi.mocked(fetchTags).mockResolvedValue([
   {tagId:7,name:'Unused',sceneCount:0},
   {tagId:3,name:'Warm light',sceneCount:8},
   {tagId:5,name:'Copper',sceneCount:4},
   {tagId:2,name:'Glass',sceneCount:12},
   {tagId:6,name:'Night drive',sceneCount:2},
   {tagId:4,name:'After hours',sceneCount:8},
   {tagId:1,name:'Slow motion',sceneCount:25},
  ])
  show()
  const filters=within(await screen.findByLabelText('Filter recent scenes'))
  await filters.findByRole('button',{name:'Slow motion'})
  expect(filters.getAllByRole('button').map(button=>button.textContent)).toEqual(['All','Slow motion','Glass','After hours','Warm light'])
  expect(filters.getByRole('button',{name:'All'})).toHaveAttribute('aria-pressed','true')
  expect(fetchTags).toHaveBeenCalledWith({attachedOnly:true})
  expect(fetchTags).toHaveBeenCalledTimes(1)
 })
 it('does not fill a short database tag list with hardcoded choices',async()=>{
  vi.mocked(fetchTags).mockResolvedValue([{tagId:19,name:'Late night',sceneCount:2},{tagId:20,name:'Unused',sceneCount:0}])
  show()
  const filters=within(await screen.findByLabelText('Filter recent scenes'))
  await filters.findByRole('button',{name:'Late night'})
  expect(filters.getAllByRole('button').map(button=>button.textContent)).toEqual(['All','Late night'])
 })
 it('shows only All when no attached tags are returned',async()=>{
  vi.mocked(fetchTags).mockResolvedValue([])
  show()
  await screen.findByText('Newest scene')
  const filters=within(screen.getByLabelText('Filter recent scenes'))
  expect(filters.getAllByRole('button').map(button=>button.textContent)).toEqual(['All'])
  expect(filters.getByRole('button',{name:'All'})).toHaveAttribute('aria-pressed','true')
 })
 it('keeps the tag choices and featured player stable while filtering and retrying scenes',async()=>{
  vi.mocked(fetchTags).mockResolvedValue([{tagId:21,name:'Glass',sceneCount:9},{tagId:22,name:'Warm light',sceneCount:4}])
  show()
  await screen.findByText('Live featured player')
  const filters=within(screen.getByLabelText('Filter recent scenes'))
  await filters.findByRole('button',{name:'Glass'})
  const featuredCalls=vi.mocked(fetchSceneDetail).mock.calls.length
  const choices=filters.getAllByRole('button').map(button=>button.textContent)
  vi.mocked(fetchScenes).mockRejectedValueOnce(new Error('offline'))
  fireEvent.click(filters.getByRole('button',{name:'Glass'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Scenes couldn’t be loaded')
  expect(fetchScenes).toHaveBeenLastCalledWith('Glass')
  expect(fetchSceneDetail).toHaveBeenCalledTimes(featuredCalls)
  expect(filters.getAllByRole('button').map(button=>button.textContent)).toEqual(choices)
  fireEvent.click(screen.getByRole('button',{name:'Try again'}))
  expect(await screen.findByText('Newest scene')).toBeInTheDocument()
  expect(filters.getByRole('button',{name:'Glass'})).toHaveAttribute('aria-pressed','true')
  expect(filters.getAllByRole('button').map(button=>button.textContent)).toEqual(choices)
  expect(fetchTags).toHaveBeenCalledTimes(1)
 })
 it('dismisses only the guest panel and leaves featured content visible',async()=>{
  show()
  await screen.findByText('Live featured player')
  fireEvent.click(screen.getByRole('button',{name:'Dismiss create prompt'}))
  expect(screen.queryByRole('heading',{name:'Build something that reacts.'})).not.toBeInTheDocument()
  expect(screen.getByRole('heading',{name:'Featured Scenes'})).toBeInTheDocument()
 })
 it('shows a retry when scene loading fails',async()=>{
  vi.mocked(fetchScenes).mockRejectedValueOnce(new Error('offline'))
  show()
  expect(await screen.findByRole('alert')).toHaveTextContent('Scenes couldn’t be loaded')
  fireEvent.click(screen.getByRole('button',{name:'Try again'}))
  expect(await screen.findByText('Newest scene')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
 })
 it('offers featured recovery without treating a failed request as an empty collection',async()=>{
  vi.mocked(fetchSceneDetail).mockRejectedValueOnce(new Error('offline'))
  show()
  const featuredSection=screen.getByRole('region',{name:'Featured Scenes'})
  expect(await within(featuredSection).findByRole('alert')).toHaveTextContent('Featured scene unavailable')
  expect(within(featuredSection).getByRole('link',{name:'Explore scenes'})).toHaveAttribute('href','/scenes')
  expect(screen.queryByRole('heading',{name:'The next feature is on its way'})).not.toBeInTheDocument()
  fireEvent.click(within(featuredSection).getByRole('button',{name:'Try again'}))
  expect(await screen.findByText('Live featured player')).toBeInTheDocument()
  expect(within(featuredSection).queryByRole('alert')).not.toBeInTheDocument()
 })
 it('distinguishes an empty homepage from an empty tag filter',async()=>{
  vi.mocked(fetchScenes).mockResolvedValue([])
  show()
  const recentSection=screen.getByRole('region',{name:'For You'})
  expect(await within(recentSection).findByRole('heading',{name:'No scenes here yet'})).toBeInTheDocument()
  expect(within(recentSection).getByRole('link',{name:'Create a scene'})).toHaveAttribute('href','/create-scene')
  expect(within(recentSection).queryByRole('button',{name:'Show all scenes'})).not.toBeInTheDocument()
 })
 it('clears an empty recent-scene filter without reloading the featured scene',async()=>{
  show()
  await screen.findByText('Live featured player')
  const featuredCalls=vi.mocked(fetchSceneDetail).mock.calls.length
  const recentSection=screen.getByRole('region',{name:'For You'})
  vi.mocked(fetchScenes).mockResolvedValueOnce([])
  fireEvent.click(screen.getByRole('button',{name:'Ambient'}))
  expect(await within(recentSection).findByRole('heading',{name:'No scenes match this tag'})).toBeInTheDocument()
  expect(within(recentSection).getByRole('status')).toHaveTextContent('Ambient')
  fireEvent.click(within(recentSection).getByRole('button',{name:'Show all scenes'}))
  expect(await screen.findByText('Newest scene')).toBeInTheDocument()
  expect(fetchScenes).toHaveBeenLastCalledWith(null)
  expect(screen.getByRole('button',{name:'All'})).toHaveAttribute('aria-pressed','true')
  expect(fetchSceneDetail).toHaveBeenCalledTimes(featuredCalls)
 })
 it('offers collection browsing when no featured scene is available',async()=>{
  vi.stubEnv('VITE_HOME_FEATURED_SCENE_ID','')
  vi.mocked(fetchScenes).mockResolvedValue([])
  show()
  const featuredSection=screen.getByRole('region',{name:'Featured Scenes'})
  expect(await within(featuredSection).findByRole('heading',{name:'The next feature is on its way'})).toBeInTheDocument()
  expect(within(featuredSection).getByRole('link',{name:'Explore scenes'})).toHaveAttribute('href','/scenes')
  expect(within(featuredSection).queryByRole('button',{name:'Try again'})).not.toBeInTheDocument()
  expect(fetchSceneDetail).not.toHaveBeenCalled()
 })
 it('keeps the featured player loaded when filtering recent scenes',async()=>{
  show()
  await screen.findByText('Live featured player')
  const initialCalls=vi.mocked(fetchSceneDetail).mock.calls.length
  fireEvent.click(screen.getByRole('button',{name:'Ambient'}))
  await waitFor(()=>expect(fetchScenes).toHaveBeenCalledWith('Ambient'))
  await waitFor(()=>expect(screen.queryByText('Loading recent scenes')).not.toBeInTheDocument())
  expect(fetchSceneDetail).toHaveBeenCalledTimes(initialCalls)
 })
 it('shares the featured scene, welcome artwork, and discovery in Classic Blue',async()=>{
  show('classic-facebook')
  expect(screen.getByRole('heading',{name:'Build something that reacts.'})).toBeInTheDocument()
  expect(screen.getByTestId('welcome-brand-scene')).toHaveAttribute('data-react-to-beat','false')
  expect(screen.getByRole('heading',{name:'Featured Scenes'})).toBeInTheDocument()
  expect(await screen.findByText('Live featured player')).toBeInTheDocument()
  expect(screen.getByRole('link',{name:/Ari Rivera@aririvera/})).toHaveAttribute('href','/@aririvera')
  expect(screen.getByLabelText('For You scenes')).toBeInTheDocument()
  expect(fetchTags).toHaveBeenCalledWith({attachedOnly:true})
 })
 it('keeps Classic Blue featured content and working filters when signed in',async()=>{
  authState.isAuthenticated=true
  show('classic-facebook')
  expect(screen.queryByRole('heading',{name:'Build something that reacts.'})).not.toBeInTheDocument()
  expect(await screen.findByText('Live featured player')).toBeInTheDocument()
  fireEvent.click(await screen.findByRole('button',{name:'Ambient'}))
  await waitFor(()=>expect(fetchScenes).toHaveBeenCalledWith('Ambient'))
  expect(screen.getByRole('link',{name:/Open scene/})).toHaveAttribute('href','/scenes/1')
 })
})
