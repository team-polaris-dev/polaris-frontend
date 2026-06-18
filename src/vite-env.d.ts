/// <reference types="vite/client" />

// three 0.184 는 자체 .d.ts 를 제공하지 않고 @types/three 도 없으므로,
// 배경 컴포넌트(StarField)에서 쓸 수 있게 모듈을 느슨하게(any) 선언한다.
declare module 'three'
