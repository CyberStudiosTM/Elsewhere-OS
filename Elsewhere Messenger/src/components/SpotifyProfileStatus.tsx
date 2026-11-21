import { useSpotifyNowPlaying } from '../services/spotifyNowPlaying'
export default function SpotifyProfileStatus({ fallback }: { fallback: string }) {
  const state = useSpotifyNowPlaying()
  const track = state.hidden ? null : state.track
  const summary = state.hidden ? 'Spotify · activity hidden'
    : state.error ? 'Spotify · playback unavailable'
    : state.connected ? 'Spotify · nothing playing' : fallback
  return <button type="button" title="Configure Spotify Now Playing" onClick={() => window.dispatchEvent(new Event('elsewhere:spotify:open'))}
    style={{ display:'inline-flex', alignItems:'center', gap:5, padding:0, border:0, background:'transparent', color:'inherit', font:'inherit', textAlign:'left', cursor:'pointer' }}>
    {track?.artwork && <img src={track.artwork} alt="" width={20} height={20} style={{objectFit:'cover',borderRadius:3}} />}
    <span>♫ {track ? `${track.playing ? 'listening to' : 'paused'}: ${track.title} · ${track.artist}` : summary}</span>
  </button>
}
