# 🤖 HexaBOT (Three.js Inverse Kinematics)

Simulador 3D interativo de robô hexápode (**HexaBOT**) com cinemática inversa vetorial (IK 3-DoF), curva adaptativa de elevação, balanço orgânico auto-calibrado, blendshapes faciais e controle de iluminação em tempo real.

## 🚀 Funcionalidades
- **IK 3-DoF com Base Ortonormal:** Movimentação estável de 6 pernas ancoradas ao solo sem torção (*bank/roll*).
- **Curva Adaptativa da Coxa:** Elevação dinâmica das juntas conforme a altura do corpo varia entre 0.0m e 2.5m.
- **Auto-Balanço / Rebolado:** Oscilações orgânicas e calibradas de pitch, roll, yaw e translação.
- **BlendShapes Faciais:** Controle em tempo real das íris (IRIS_E e IRIS_D).
- **Iluminação & Marcadores 3D:** Marcadores visuais posicionais para luz direcional e rim lights com sliders no painel GUI.

## 🛠️ Tecnologias
- **Three.js** (v0.160.0)
- **lil-gui** (v0.19.1)
- **GLTFLoader** + **OrbitControls**
