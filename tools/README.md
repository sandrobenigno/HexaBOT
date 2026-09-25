# 🔬 Laboratório de Cinemática Inversa (IK) & Ferramentas HexaBOT

[![GitHub Pages](https://img.shields.io/badge/Demo%20Online-GitHub%20Pages-38bdf8?style=for-the-badge&logo=github)](https://sandrobenigno.github.io/HexaBOT/)
[![Three.js](https://img.shields.io/badge/Three.js-r160-black?style=for-the-badge&logo=three.js)](https://threejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

Esta pasta reúne o conjunto de ferramentas interativas, ambientes de calibração, diagnóstico e a oficina de auto-rigging desenvolvidos durante o estudo aprofundado de cinemática inversa vetorial (IK 3-DoF), deformações de malha (*Shape Keys*) e persistência de manifestos biomecânicos.

---

## 🛠️ Confronto e Catálogo de Ferramentas

| Ferramenta | Link Online (GitHub Pages) | Foco Principal | Modelo Base / Fonte | Recursos Exclusivos |
| :--- | :--- | :--- | :--- | :--- |
| **Tool 1: Simulador Clássico & Mobile** | [Acessar Tool 1](https://sandrobenigno.github.io/HexaBOT/tools/index.html) | Simulação ágil, visualização de marcha e suporte mobile | `aranha.glb` | Curva Hermítica (*Smoothstep*), Auto-Sway contínuo, interface touch, telemetria simplificada |
| **Tool 2: Oficina de Rigging & Exportador** | [Acessar Tool 2](https://sandrobenigno.github.io/HexaBOT/tools/index2.html) | Auto-detecção de anatomia, calibração manual e exportação | Drag-and-Drop / `aranha.glb` / `aranha_pernalonga.glb` | Varredura Regex de sockets, medição métrica 3D ($L_1, L_2, L_3$), Console de Shape Keys (Mesa de Som), exportação de `.glb` com manifesto embutido e `.bot.json` |
| **Tool 3: Runtime de Produção com Manifesto** | [Acessar Tool 3](https://sandrobenigno.github.io/HexaBOT/tools/index3.html) | Consumo direto de manifestos e renderização de alta fidelidade | `aranha.glb` / Drag-and-Drop | Leitura de `userData.botManifest`, abas Frost Glass (IK + Shape Keys), travamento milimétrico de âncoras, iluminação HDR (*RoomEnvironment*) com rotação em tempo real |

---

## 🌟 Detalhamento das Ferramentas

### 1. 🤖 [Tool 1: Simulador Clássico & Mobile](https://sandrobenigno.github.io/HexaBOT/tools/index.html)
* **Objetivo:** Ambiente de testes de locomoção focado em responsividade e performance, ideal para validação rápida de cinemática em celulares e desktops.
* **Modelo 3D Base:** `aranha.glb` (carregado de `../hx1_walker_reborn/assets/glb/aranha.glb`).
* **Principais Funcionalidades:**
  - Curva de elevação adaptativa para a coxa com interpolação hermítica suave.
  - Balanço orgânico procedural contínuo (*Auto-Sway*).
  - Gaveta de parâmetros responsiva para dispositivos móveis.
  - Painel de atalhos e ajuda rápida via tecla <kbd>H</kbd>.

---

### 2. 🔬 [Tool 2: Oficina de Auto-Rig & Exportador de Bots](https://sandrobenigno.github.io/HexaBOT/tools/index2.html)
* **Objetivo:** Laboratório universal para importar criaturas arbitrárias, detectar sua estrutura articular e calibrar os limites cinemáticos antes do uso no jogo.
* **Auto-Rigging & Detecção Hierárquica:**
  - Varredura por Regex de ossos e sockets de pernas (`D0/E0`, `Socket`, `Hip`, `LegSocket`, etc.).
  - Medição automática dos comprimentos dos membros no espaço 3D ($L_1, L_2, L_3$).
  - Geração paramétrica de âncoras de contato de acordo com a escala do modelo.
* **Console de Shape Keys (Mesa de Som):**
  - Faders deslizantes inspirados em mesas de áudio profissionais.
  - Agrupamento inteligente de BlendShapes/Shape Keys que compartilham o mesmo nome lógico em um único fader sincronizado multi-malhas.
* **Exportação Não-Intrusiva:**
  - 💾 **Baixar Modelo .glb (Com Manifesto Embutido):** Salva o arquivo `.glb` contendo toda a receita de calibração em `userData.botManifest` (100% compatível com Blender e outros visualizadores).
  - 📄 **Baixar Manifesto .bot.json:** Exporta apenas o arquivo JSON com as medidas e parâmetros de postura.

---

### 3. 🚀 [Tool 3: Runtime de Produção (Consumidor de Manifesto)](https://sandrobenigno.github.io/HexaBOT/tools/index3.html)
* **Objetivo:** Simulador avançado de alta fidelidade que consome diretamente os arquivos gerados pela Oficina (Tool 2).
* **Recursos Avançados:**
  - Suporta *Drag-and-Drop* imediato de arquivos `.glb` e `.bot.json`.
  - **Travamento Milimétrico das Âncoras:** Elimina qualquer folga ou desvio entre a ponta da tíbia ($P_3$) e a âncora no solo.
  - Painel lateral *Frost Glass* com sistema de abas para **Cinemática & IK** e **Shape Keys**.
  - Iluminação PBR HDR com reflexos rotacionáveis e controle de intensidade em tempo real (*RoomEnvironment*).

---

## ⚡ Fundamentos Matemáticos e Cinemáticos

```
         (P0: Socket/Quadril)
                 O
                / \
            L1 /   \ (Ângulo de Abertura / Coxa)
              /     \
             O (P1: Joelho/Fêmur)
              \
            L2 \    (Solução Fechada por Lei dos Cossenos)
                \
                 O (P2: Tíbia)
                 |
               L3|
                 |
                 O (P3: Âncora no Solo / Ponto de Contato)
```

### 1. Cinemática Inversa Vetorial 3-DoF (Zero-Bank)
- Construção explícita de matrizes ortonormais $\mathbf{R} = [\mathbf{X} \mid \mathbf{Y} \mid \mathbf{Z}]$ alinhando o eixo da dobradiça (*hinge axis*) ao vetor local sem distorções de rolamento espúrio.
- Solução trigonométrica analítica de alta performance para os ângulos $\alpha$ (fêmur) e $\beta$ (tíbia).

### 2. Auto-Reach Fallback (Relaxamento Adaptativo Analítico)
- Quando a distância até a âncora excede o alcance nominal da coxa ($\|T - P_1\| > L_2 + L_3$), o algoritmo deduz analiticamente em **tempo constante $O(1)$** o ângulo exato de relaxamento $\gamma_{\text{fallback}}$:
  $$K = \frac{D_{\text{total}}^2 + L_1^2 - (L_2 + L_3)^2}{2 L_1 D_{\text{total}}}$$
  $$\gamma_{\text{fallback}} = \theta_{\text{target}} + \arccos(\text{clamp}(K, -1, 1))$$
  $$\gamma_{\text{efetivo}} = \min(\gamma_{\text{nominal}}, \gamma_{\text{fallback}})$$
- **Garantia Biomecânica:** A ponta da tíbia nunca se descola do solo e a cinemática mantém-se estável mesmo sob posturas extremas.

---

## ⌨️ Tabela Geral de Atalhos

| Tecla | Função |
| :---: | :--- |
| <kbd>H</kbd> | Abrir / Fechar **Janela Central de Ajuda & Atalhos** |
| <kbd>P</kbd> | Alternar **Modo Clean View** (Oculta painéis para observação) |
| <kbd>R</kbd> | **Resetar Postura** para os valores padrão |
| <kbd>A</kbd> | Ativar / Desativar **Auto-Balanço (Auto-Sway)** |
| <kbd>X</kbd> | Alternar **Modo Raio-X** (Visualização articular e esquelética) |
| <kbd>I</kbd> | Alternar **Painel de Telemetria / Métricas HUD** |
| <kbd>Esc</kbd> | Fechar modal ativo |
