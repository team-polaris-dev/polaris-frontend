import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useTheme } from '../theme/ThemeContext'
import { useSettings } from '../theme/SettingsContext'

/* ──────────────────────────────────────────────────────────────
   별 배경 (Three.js) — 자동으로 천천히 도는 3D 스타필드.
   페이지 배경 위에 투명 캔버스로 깔린다(라이트/다크 테마 배경이 비치게).
   원본 스크립트(PointCloud/CanvasRenderer 등 구버전 API)를 three 0.184
   현대 API(Points/PointsMaterial/BufferGeometry)로 포팅한 것.

   라이트 배경에선 흰 별이 묻히므로 별 색을 테마에 맞춘다:
   다크=흰색, 라이트=짙은 슬레이트(흰 배경에서도 보이게).
   ────────────────────────────────────────────────────────────── */
const starColor = (theme: string) => (theme === 'dark' ? 0xffffff : 0x334155)

export default function StarField() {
  const containerRef = useRef<HTMLDivElement>(null)
  const materialRef = useRef<any>(null) // three 셰임이 any 라 구체 타입 대신 any
  const { theme } = useTheme()
  // 씬 재생성 없이 초기 색을 정하기 위해 최신 테마를 ref 로 들고 있는다
  const themeRef = useRef(theme)
  themeRef.current = theme
  // 배경 별 설정 — 속도·방향은 루프가 ref 로 실시간 참조, 크기·밝기는 머티리얼에 반영.
  // 개수는 별 무리를 다시 만들어야 하므로 메인 effect 의 의존성으로 둔다.
  const { starSpeed, starDirection, starCount, starSize, starBrightness } = useSettings()
  const speedRef = useRef(starSpeed)
  speedRef.current = starSpeed
  const dirRef = useRef(starDirection)
  dirRef.current = starDirection

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let width = container.clientWidth || window.innerWidth
    let height = container.clientHeight || window.innerHeight

    // Scene + 카메라
    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x000000, 0.0003)

    const camera = new THREE.PerspectiveCamera(75, width / height, 1, 1000)
    camera.position.z = 500

    // 별 — (-1000..1000) 정육면체에 균일 분포
    const positions = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount * 3; i++) {
      positions[i] = Math.random() * 2000 - 1000
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    // size·opacity 초기값은 아래 별도 effect 가 설정값으로 곧바로 덮어쓴다
    const material = new THREE.PointsMaterial({
      color: starColor(themeRef.current),
      size: 1.2,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    })
    materialRef.current = material
    const stars = new THREE.Points(geometry, material)
    scene.add(stars)

    // 렌더러 — 투명 배경(테마 배경이 비치도록), DPR 캡으로 성능 보호
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setClearColor(0x000011, 0)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height)
    container.appendChild(renderer.domElement)

    const onResize = () => {
      width = container.clientWidth || window.innerWidth
      height = container.clientHeight || window.innerHeight
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }
    window.addEventListener('resize', onResize, false)

    let raf = 0
    const BASE = 0.00035 // 속도 1× 기준 회전량(라디안/프레임)
    const render = () => {
      // 마우스 없이 자동으로 — 속도(배율)·방향(각도)을 적용해 회전. 0=정지.
      const s = speedRef.current
      const rad = (dirRef.current * Math.PI) / 180
      stars.rotation.y += BASE * s * Math.cos(rad) // 가로 방향 성분
      stars.rotation.x += BASE * s * Math.sin(rad) // 세로 방향 성분
      camera.lookAt(scene.position)
      renderer.render(scene, camera)
      raf = requestAnimationFrame(render)
    }
    raf = requestAnimationFrame(render)

    // 정리 — 컨텍스트/버퍼 해제(페이지 전환·StrictMode 재마운트 대비)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      geometry.dispose()
      material.dispose()
      materialRef.current = null
      renderer.dispose()
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
    }
    // 개수가 바뀌면 별 무리를 다시 생성한다(geometry 재구성 필요)
  }, [starCount])

  // 테마 전환 시 씬 재생성 없이 별 색만 갱신 (라이트=별 묻힘 방지). 밝기는 사용자 설정.
  useEffect(() => {
    const m = materialRef.current
    if (!m) return
    m.color.set(starColor(theme))
    m.needsUpdate = true
  }, [theme])

  // 크기·밝기 — 씬 재생성 없이 머티리얼에 실시간 반영
  useEffect(() => {
    const m = materialRef.current
    if (!m) return
    m.size = starSize
    m.opacity = starBrightness
    m.needsUpdate = true
  }, [starSize, starBrightness])

  return <div ref={containerRef} className="absolute inset-0 overflow-hidden pointer-events-none" />
}
