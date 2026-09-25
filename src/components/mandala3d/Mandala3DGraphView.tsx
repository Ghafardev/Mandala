import React, {useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
    RotateCcw,
    Compass,
    Play,
    Layers,
    Sparkles,
    Info,
    Maximize2,
    ZoomIn,
    ZoomOut,
    Eye,
    EyeOff,
    Cpu,
    Flame,
    Activity,
    HardDrive,
} from 'lucide-react';
import {
  MandalaNode3D,
  MandalaEdge3D,
  MandalaRingLayer,
} from './types';
import {
    MANDALA_COLORS,
    INITIAL_MANDALA_NODES,
    INITIAL_MANDALA_EDGES,
} from './mandalaData';
import { MandalaNodeInspector } from './MandalaNodeInspector';
import { fetchWithBackendFallback } from '../../lib/api';

export interface Mandala3DGraphViewProps {
    onLogMessage?: (msg: string) => void;
    telemetryData?: any;
    isCompiling?: boolean;
    onRunKernel?: () => void;
}

export const Mandala3DGraphView: React.FC<Mandala3DGraphViewProps> = ({
    onLogMessage,
    telemetryData,
    isCompiling = false,
    onRunKernel,
}) => {
const containerRef = useRef<HTMLDivElement>(null);

  // Nodes & Edges state
  const [nodes, setNodes] = useState<MandalaNode3D[]>(INITIAL_MANDALA_NODES);
  const [edges] = useState<MandalaEdge3D[]>(INITIAL_MANDALA_EDGES);

  // Interaction State
  const [selectedNode, setSelectedNode] = useState<MandalaNode3D | null>(null);
  const [hoveredNode, setHoveredNode] = useState<MandalaNode3D | null>(null);
  const [activeLayerFilter, setActiveLayerFilter] = useState<
    'all' | MandalaRingLayer
  >('all');
  const [showGuidelines, setShowGuidelines] = useState(true);
  const [isAutoRotate, setIsAutoRotate] = useState(true);
  const [localCompiling, setLocalCompiling] = useState(false);

  // Three.js instances refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const nodeMeshesRef = useRef<Map<string, THREE.Group>>(new Map());
  const edgeLinesRef = useRef<
    Map<string, { line: THREE.Line; material: THREE.LineBasicMaterial }>
  >(new Map());
  const guidelineGroupRef = useRef<THREE.Group | null>(null);
  const seedPulsarRef = useRef<THREE.Mesh | null>(null);
  const seedLightRef = useRef<THREE.PointLight | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  // Tooltip tracking
  const [tooltip, setTooltip] = useState<{
    node: MandalaNode3D | null;
    x: number;
    y: number;
    visible: boolean;
  }>({
    node: null,
    x: 0,
    y: 0,
    visible: false,
  });

  // Calculate Cartesian position (x, y, z) from polar (r, theta, elevation)
  const getCartesian = useCallback((r: number, deg: number, z: number = 0) => {
    const rad = (deg * Math.PI) / 180;
    return new THREE.Vector3(r * Math.cos(rad), z, r * Math.sin(rad));
  }, []);

  // Update node positions if nodes array changes
  const nodePositions = useMemo(() => {
    const map = new Map<string, THREE.Vector3>();
    nodes.forEach((n) => {
      map.set(n.id, getCartesian(n.ringRadius, n.angleDeg, n.elevation));
    });
    return map;
  }, [nodes, getCartesian]);

  // Execute kernel action from 3D view
  const handleRunKernel = useCallback(async () => {
    if (onRunKernel) {
      onRunKernel();
      return;
    }

    setLocalCompiling(true);
    if (onLogMessage) {
      onLogMessage(`[3D-MANDALA] Dispatching ROCm Triton Kernel on MI300X...`);
    }

    try {
      const res = await fetchWithBackendFallback('/api/v1/triton/compile-and-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kernel_type: 'vector_add',
          vector_size: 16384,
          M: 128,
          N: 128,
          K: 1,
          block_size_m: 128,
          block_size_n: 1,
          block_size_k: 1,
          num_warps: 8,
          num_stages: 2,
          dtype: 'bfloat16',
          target_arch: 'gfx942',
        }),
      });

      const data = await res.json();
      if (onLogMessage) {
        onLogMessage(`[3D-MANDALA] Kernel compiled: ${data.kernel_name} | Latency: ${data.metrics?.latency_us} μs`);
      }
    } catch (e: any) {
      if (onLogMessage) {
        onLogMessage(`[3D-MANDALA] Execution error: ${e.message}`);
      }
    } finally {
      setLocalCompiling(false);
    }
  }, [onRunKernel, onLogMessage]);

  // Reset Geometry: re-aligns nodes & resets camera
  const handleResetGeometry = useCallback(() => {
    setNodes(INITIAL_MANDALA_NODES);
    setSelectedNode(null);
    setHoveredNode(null);

    if (controlsRef.current && cameraRef.current) {
      controlsRef.current.target.set(0, 0, 0);
      cameraRef.current.position.set(0, 18, 16);
      controlsRef.current.update();
    }
  }, []);

  // Initialize Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Scene with deep Obsidian Charcoal gradient ambience
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.fog = new THREE.FogExp2(0x0b0c10, 0.022);

    // Perspective Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 19, 17);
    cameraRef.current = camera;

    // WebGL Renderer with antialiasing and high pixel ratio
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x0b0c10, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    rendererRef.current = renderer;

    container.appendChild(renderer.domElement);

    // Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.08; // Limit viewing below ground
    controls.minDistance = 4;
    controls.maxDistance = 50;
    controls.autoRotate = isAutoRotate;
    controls.autoRotateSpeed = 0.6;
    controlsRef.current = controls;

    // Lighting Setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffecd1, 1.8);
    dirLight.position.set(10, 25, 10);
    scene.add(dirLight);

    // Golden Core Point Light (Center Seed)
    const seedLight = new THREE.PointLight(0xffd700, 3.5, 28);
    seedLight.position.set(0, 0.5, 0);
    scene.add(seedLight);
    seedLightRef.current = seedLight;

    // Secondary Warm Vermilion Light
    const orangeLight = new THREE.PointLight(0xfb8500, 2.0, 25);
    orangeLight.position.set(-6, 2, -6);
    scene.add(orangeLight);

    // ----------------------------------------------------
    // Sacred Geometry & Concentric Guideline Rings
    // ----------------------------------------------------
    const guidelines = new THREE.Group();
    guidelineGroupRef.current = guidelines;
    scene.add(guidelines);

    const ringRadii = [4.2, 8.0, 11.8];
    const ringColors = [
      MANDALA_COLORS.radiantAmber,
      MANDALA_COLORS.energeticVermilion,
      MANDALA_COLORS.crimsonRuby,
    ];

    ringRadii.forEach((radius, idx) => {
      // Smooth concentric circle line
      const circlePoints: THREE.Vector3[] = [];
      const segments = 128;
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        circlePoints.push(
          new THREE.Vector3(radius * Math.cos(theta), 0, radius * Math.sin(theta))
        );
      }
      const circleGeo = new THREE.BufferGeometry().setFromPoints(circlePoints);
      const circleMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(ringColors[idx]),
        transparent: true,
        opacity: 0.28,
        linewidth: 1,
      });
      const circleLine = new THREE.Line(circleGeo, circleMat);
      guidelines.add(circleLine);

      // Glowing delicate torus ring
      const torusGeo = new THREE.TorusGeometry(radius, 0.025, 16, 100);
      const torusMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(ringColors[idx]),
        transparent: true,
        opacity: 0.15,
      });
      const torus = new THREE.Mesh(torusGeo, torusMat);
      torus.rotation.x = Math.PI / 2;
      guidelines.add(torus);
    });

    // Radial Spokes (Sacred 12-Fold Star of Mandala)
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const spokePoints = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(12.5 * Math.cos(angle), 0, 12.5 * Math.sin(angle)),
      ];
      const spokeGeo = new THREE.BufferGeometry().setFromPoints(spokePoints);
      const spokeMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(0xffd700),
        transparent: true,
        opacity: i % 3 === 0 ? 0.25 : 0.1,
      });
      guidelines.add(new THREE.Line(spokeGeo, spokeMat));
    }

    // Sacred Geometry Petal Diamonds (Subtle golden lattice)
    for (let r = 0; r < 3; r++) {
      const rad = ringRadii[r];
      const petalPoints: THREE.Vector3[] = [];
      const petalCount = 8;
      for (let p = 0; p <= petalCount; p++) {
        const theta = (p / petalCount) * Math.PI * 2;
        const offsetRad = p % 2 === 0 ? rad * 1.08 : rad * 0.92;
        petalPoints.push(
          new THREE.Vector3(
            offsetRad * Math.cos(theta),
            0,
            offsetRad * Math.sin(theta)
          )
        );
      }
      const petalGeo = new THREE.BufferGeometry().setFromPoints(petalPoints);
      const petalMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(0xffb703),
        transparent: true,
        opacity: 0.18,
      });
      guidelines.add(new THREE.Line(petalGeo, petalMat));
    }

    // ----------------------------------------------------
    // Create 3D Nodes
    // ----------------------------------------------------
    const nodeGroup = new THREE.Group();
    scene.add(nodeGroup);
    const nodeMeshes = new Map<string, THREE.Group>();

    nodes.forEach((node) => {
      const group = new THREE.Group();
      const pos = getCartesian(node.ringRadius, node.angleDeg, node.elevation);
      group.position.copy(pos);
      group.userData = { nodeId: node.id, nodeData: node };

      const isSeed = node.layer === 'seed';
      const coreSize = isSeed ? 0.72 : node.layer === 'tensor' ? 0.44 : node.layer === 'triton' ? 0.48 : 0.42;

      // Inner Core Sphere
      const sphereGeo = new THREE.SphereGeometry(coreSize, 32, 32);
      const sphereMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(node.color),
        roughness: 0.25,
        metalness: 0.85,
        emissive: new THREE.Color(node.glowColor),
        emissiveIntensity: isSeed ? 0.8 : 0.4,
      });
      const sphere = new THREE.Mesh(sphereGeo, sphereMat);
      sphere.userData = { isInteractable: true, nodeId: node.id };
      group.add(sphere);

      // Outer Aura Pulsing Shell
      const auraGeo = new THREE.SphereGeometry(coreSize * 1.55, 24, 24);
      const auraMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(node.glowColor),
        transparent: true,
        opacity: isSeed ? 0.35 : 0.18,
        wireframe: true,
      });
      const aura = new THREE.Mesh(auraGeo, auraMat);
      aura.userData = { isAura: true };
      group.add(aura);

      if (isSeed) {
        seedPulsarRef.current = aura;
      }

      // Orbital Halo Ring around node
      const haloGeo = new THREE.TorusGeometry(coreSize * 1.8, 0.02, 16, 32);
      const haloMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(node.color),
        transparent: true,
        opacity: 0.6,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.rotation.x = Math.PI / 3;
      group.add(halo);

      nodeGroup.add(group);
      nodeMeshes.set(node.id, group);
    });
    nodeMeshesRef.current = nodeMeshes;

    // ----------------------------------------------------
    // Create 3D Bezier Connecting Wires
    // ----------------------------------------------------
    const edgeGroup = new THREE.Group();
    scene.add(edgeGroup);
    const edgeLines = new Map<
      string,
      { line: THREE.Line; material: THREE.LineBasicMaterial }
    >();

    edges.forEach((edge) => {
      const srcPos = nodePositions.get(edge.source);
      const tgtPos = nodePositions.get(edge.target);
      if (!srcPos || !tgtPos) return;

      // 3D Quadratic Bezier Curve elevated slightly for aesthetic arcs
      const mid = new THREE.Vector3()
        .addVectors(srcPos, tgtPos)
        .multiplyScalar(0.5);
      const dist = srcPos.distanceTo(tgtPos);
      mid.y += Math.min(1.8, dist * 0.18);

      // Use CatmullRomCurve3 for smooth spline between points (QuadraticBezierCurve3 may be missing in some three typings)
      const pts = [srcPos.clone(), mid.clone(), tgtPos.clone()];
      // Compute quadratic Bezier points directly to avoid relying on three typings
      const points: THREE.Vector3[] = [];
      const p0 = srcPos;
      const p1 = mid;
      const p2 = tgtPos;
      const steps = 36;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const omt = 1 - t;
        const x = omt * omt * p0.x + 2 * omt * t * p1.x + t * t * p2.x;
        const y = omt * omt * p0.y + 2 * omt * t * p1.y + t * t * p2.y;
        const z = omt * omt * p0.z + 2 * omt * t * p1.z + t * t * p2.z;
        points.push(new THREE.Vector3(x, y, z));
      }
      const edgeGeo = new THREE.BufferGeometry().setFromPoints(points);

      const edgeMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(edge.color),
        transparent: true,
        opacity: edge.type === 'radial' ? 0.75 : edge.type === 'cross' ? 0.6 : 0.35,
        linewidth: 1.5,
      });

      const line = new THREE.Line(edgeGeo, edgeMat);
      line.userData = { edgeId: edge.id, source: edge.source, target: edge.target };
      edgeGroup.add(line);
      edgeLines.set(edge.id, { line, material: edgeMat });
    });
    edgeLinesRef.current = edgeLines;

    // ----------------------------------------------------
    // Raycasting & Mouse Interaction Setup
    // ----------------------------------------------------
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      // Collect all interactive spheres
      const interactables: THREE.Object3D[] = [];
      nodeMeshes.forEach((g) => {
        g.children.forEach((c) => {
          if (c.userData?.isInteractable) interactables.push(c);
        });
      });

      const intersects = raycaster.intersectObjects(interactables, false);

      if (intersects.length > 0) {
        const hit = intersects[0].object;
        const targetNodeId = hit.userData?.nodeId;
        const found = nodes.find((n) => n.id === targetNodeId) || null;

        setHoveredNode(found);
        setTooltip({
          node: found,
          x: e.clientX,
          y: e.clientY,
          visible: true,
        });

        renderer.domElement.style.cursor = 'pointer';
      } else {
        setHoveredNode(null);
        setTooltip((prev) => ({ ...prev, visible: false }));
        renderer.domElement.style.cursor = 'default';
      }
    };

    const handlePointerDown = (e: MouseEvent) => {
      // Ignore if clicking on UI overlay
      if ((e.target as HTMLElement).closest('.mandala-ui-overlay')) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const interactables: THREE.Object3D[] = [];
      nodeMeshes.forEach((g) => {
        g.children.forEach((c) => {
          if (c.userData?.isInteractable) interactables.push(c);
        });
      });

      const intersects = raycaster.intersectObjects(interactables, false);
      if (intersects.length > 0) {
        const hit = intersects[0].object;
        const targetNodeId = hit.userData?.nodeId;
        const found = nodes.find((n) => n.id === targetNodeId) || null;
        setSelectedNode(found);
      }
    };

    renderer.domElement.addEventListener('mousemove', handlePointerMove);
    renderer.domElement.addEventListener('click', handlePointerDown);

    // ----------------------------------------------------
    // Resize Observer
    // ----------------------------------------------------
    const resizeObserver = new ResizeObserver(() => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    // ----------------------------------------------------
    // Animation Render Loop
    // ----------------------------------------------------
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameIdRef.current = requestAnimationFrame(animate);

      const elapsed = clock.getElapsedTime();

      // Golden Pulse on Core Seed
      if (seedPulsarRef.current) {
        const pulse = 1.0 + 0.18 * Math.sin(elapsed * 2.8);
        seedPulsarRef.current.scale.set(pulse, pulse, pulse);
        seedPulsarRef.current.rotation.y = elapsed * 0.4;
      }

      if (seedLightRef.current) {
        seedLightRef.current.intensity = 3.2 + 1.2 * Math.sin(elapsed * 3.2);
      }

      // Gentle rotation for node halo rings
      nodeMeshes.forEach((group) => {
        const halo = group.children[2];
        if (halo) {
          halo.rotation.z += 0.008;
        }
      });

      // Orbit guidelines subtle counter-rotation
      if (guidelineGroupRef.current) {
        guidelineGroupRef.current.rotation.y = elapsed * 0.02;
      }

      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    // Cleanup on unmount
    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('mousemove', handlePointerMove);
      renderer.domElement.removeEventListener('click', handlePointerDown);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Synchronize autoRotate toggle
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = isAutoRotate;
    }
  }, [isAutoRotate]);

  // Synchronize guidelines visibility
  useEffect(() => {
    if (guidelineGroupRef.current) {
      guidelineGroupRef.current.visible = showGuidelines;
    }
  }, [showGuidelines]);

  // Handle Dynamic Hover / Selection Highlights
  useEffect(() => {
    const activeTarget = hoveredNode || selectedNode;

    edgeLinesRef.current.forEach(({ material, line }) => {
      const sourceId = line.userData.source;
      const targetId = line.userData.target;

      if (!activeTarget) {
        // Normal state
        material.opacity = 0.45;
        material.color.set(MANDALA_COLORS.solarGold);
      } else if (
        sourceId === activeTarget.id ||
        targetId === activeTarget.id
      ) {
        // Bright golden energy pulse
        material.opacity = 1.0;
        material.color.set(0xffd700);
      } else {
        // Dimmed unrelated wires
        material.opacity = 0.1;
        material.color.set(0x3f3f46);
      }
    });

    // Dim or highlight node meshes based on filter and hover
    nodeMeshesRef.current.forEach((group, nodeId) => {
      const node = nodes.find((n) => n.id === nodeId);
      const isFilteredOut =
        activeLayerFilter !== 'all' && node?.layer !== activeLayerFilter;

      const sphereMesh = group.children[0] as THREE.Mesh;
      const auraMesh = group.children[1] as THREE.Mesh;
      const haloMesh = group.children[2] as THREE.Mesh;

      if (!sphereMesh || !auraMesh) return;

      const isFocused =
        activeTarget &&
        (nodeId === activeTarget.id ||
          edges.some(
            (e) =>
              (e.source === activeTarget.id && e.target === nodeId) ||
              (e.target === activeTarget.id && e.source === nodeId)
          ));

      if (isFilteredOut) {
        group.visible = false;
      } else {
        group.visible = true;

        if (activeTarget && !isFocused) {
          // Dim unrelated
          sphereMesh.scale.set(0.75, 0.75, 0.75);
          (sphereMesh.material as THREE.MeshStandardMaterial).opacity = 0.25;
          (sphereMesh.material as THREE.MeshStandardMaterial).transparent = true;
          auraMesh.visible = false;
        } else {
          // Normal or focused
          const scale = nodeId === activeTarget?.id ? 1.35 : 1.0;
          sphereMesh.scale.set(scale, scale, scale);
          (sphereMesh.material as THREE.MeshStandardMaterial).opacity = 1.0;
          auraMesh.visible = true;
        }
      }
    });
  }, [hoveredNode, selectedNode, activeLayerFilter, nodes, edges]);

  // Focus camera smoothly on a node
  const handleFocusNode = useCallback(
    (targetNode: MandalaNode3D) => {
      const targetPos = getCartesian(
        targetNode.ringRadius,
        targetNode.angleDeg,
        targetNode.elevation
      );
      if (controlsRef.current && cameraRef.current) {
        controlsRef.current.target.copy(targetPos);
        cameraRef.current.position.set(
          targetPos.x * 1.3 + 1,
          targetPos.y + 4.5,
          targetPos.z * 1.3 + 6
        );
        controlsRef.current.update();
      }
    },
    [getCartesian]
  );

  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-b from-[#0B0C10] via-[#0E1017] to-[#12141D] select-none font-sans">
      {/* 3D WebGL Canvas Viewport */}
      <div ref={containerRef} className="h-full w-full" />

      {/* Floating Header HUD: Mandala Sacred Geometry Engine */}
      <div className="mandala-ui-overlay absolute top-3 left-4 right-4 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        {/* Left: Branding & Layer Filters */}
        <div className="flex items-center gap-2 pointer-events-auto bg-zinc-950/80 p-1.5 rounded-xl border border-zinc-800/80 backdrop-blur-md shadow-xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-zinc-950 font-bold shadow-md">
            ☸️
          </div>
          <div>
            <h2 className="text-xs font-bold tracking-wider text-amber-300 uppercase">
              3D MANDALA GRAPH
            </h2>
            <p className="text-[10px] font-mono text-zinc-400">
              AMD CDNA 3 Radial Graph Architecture
            </p>
          </div>

          <div className="h-5 w-px bg-zinc-800 mx-1" />

          {/* Layer Filter Buttons */}
          <div className="flex items-center gap-1">
            {[
              { id: 'all', label: 'All Rings' },
              { id: 'seed', label: 'Seed (Core)' },
              { id: 'tensor', label: 'Ring 1: Tensors' },
              { id: 'triton', label: 'Ring 2: Triton' },
              { id: 'evaluation', label: 'Ring 3: Output' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setActiveLayerFilter(f.id as any)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-mono transition border ${
                  activeLayerFilter === f.id
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-200 font-semibold'
                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Controls & Actions */}
        <div className="flex items-center gap-2 pointer-events-auto bg-zinc-950/80 p-1.5 rounded-xl border border-zinc-800/80 backdrop-blur-md shadow-xl">
          <button
            onClick={() => setIsAutoRotate(!isAutoRotate)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-mono transition ${
              isAutoRotate
                ? 'border-amber-500/40 bg-amber-950/40 text-amber-300'
                : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
            }`}
            title="Toggle automatic orbital rotation"
          >
            <Compass className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Auto-Rotate</span>
          </button>

          <button
            onClick={() => setShowGuidelines(!showGuidelines)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-mono transition ${
              showGuidelines
                ? 'border-orange-500/40 bg-orange-950/40 text-orange-300'
                : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
            }`}
            title="Toggle sacred geometry guidelines"
          >
            {showGuidelines ? (
              <Eye className="h-3.5 w-3.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">Lattice</span>
          </button>

          {/* "Reset Geometry" Button Required */}
          <button
            onClick={handleResetGeometry}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-800 hover:text-white transition shadow-sm"
            title="Re-align all nodes back into the perfect symmetric Mandala pattern"
          >
            <RotateCcw className="h-3.5 w-3.5 text-amber-400" />
            <span>Reset Geometry</span>
          </button>

          {/* Trigger Run Kernel */}
          <button
            onClick={handleRunKernel}
            disabled={isCompiling || localCompiling}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1 text-xs font-semibold text-zinc-950 shadow-md hover:brightness-110 active:scale-95 transition disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5 fill-zinc-950" />
            <span>
              {isCompiling || localCompiling ? 'Running ROCm...' : 'Run Kernel'}
            </span>
          </button>
        </div>
      </div>

      {/* Floating Bottom Left: Mandala Rings Legend & Architecture Card */}
      <div className="mandala-ui-overlay absolute bottom-4 left-4 pointer-events-auto bg-zinc-950/85 p-3 rounded-2xl border border-zinc-800/80 backdrop-blur-md shadow-2xl space-y-2 max-w-sm text-xs font-mono">
        <div className="flex items-center justify-between text-[11px] font-bold text-zinc-200 border-b border-zinc-800 pb-1.5">
          <span className="flex items-center gap-1.5 text-amber-400">
            <Sparkles className="h-3.5 w-3.5" />
            Radial Symmetry Hierarchy
          </span>
          <span className="text-zinc-500 text-[10px]">r, θ Polar Layout</span>
        </div>

        <div className="space-y-1.5 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FFD700] shadow-sm shadow-amber-400/50 animate-pulse" />
            <span className="text-amber-300 font-semibold">Core Center (The Seed):</span>
            <span className="text-zinc-400">AMD ROCm Engine & Telemetry</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FFB703]" />
            <span className="text-yellow-300 font-semibold">Ring 1 (Inner):</span>
            <span className="text-zinc-400">Data & Tensor Buffer Inputs</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FB8500]" />
            <span className="text-orange-300 font-semibold">Ring 2 (Middle):</span>
            <span className="text-zinc-400">Triton Wave64 JIT Kernels</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#E63946]" />
            <span className="text-rose-400 font-semibold">Ring 3 (Outer):</span>
            <span className="text-zinc-400">Model Evaluation & RAG Memory</span>
          </div>
        </div>

        {/* Live Mini Telemetry Strip */}
        {telemetryData && (
          <div className="pt-2 border-t border-zinc-800/80 grid grid-cols-3 gap-2 text-[10px] text-zinc-300">
            <div>
              <span className="text-zinc-500 block">VRAM:</span>
              <span className="text-amber-400 font-bold">
                {telemetryData.vram_used_gb?.toFixed(1) || '72.4'} GB
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block">Temp:</span>
              <span className="text-orange-400 font-bold">
                {telemetryData.temp_edge_c?.toFixed(1) || '54.2'}°C
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block">Compute:</span>
              <span className="text-emerald-400 font-bold">
                {telemetryData.gpu_utilization?.toFixed(1) || '42.5'}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Interactive Tooltip on Hover */}
      {tooltip.visible && tooltip.node && (
        <div
          className="fixed pointer-events-none z-40 rounded-xl border border-amber-500/40 bg-zinc-950/90 px-3 py-2 text-xs font-sans text-zinc-100 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
          style={{
            left: `${tooltip.x + 14}px`,
            top: `${tooltip.y + 14}px`,
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: tooltip.node.color }}
            />
            <span className="font-bold text-amber-200">
              {tooltip.node.name}
            </span>
          </div>
          <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
            {tooltip.node.subtitle}
          </p>
          <div className="mt-1 text-[10px] font-mono text-amber-400">
            Click node to open detail inspector ›
          </div>
        </div>
      )}

      {/* Glassmorphic Node Inspector Drawer (Click to Inspect) */}
      <MandalaNodeInspector
        node={selectedNode}
        onClose={() => setSelectedNode(null)}
        onFocusNode={handleFocusNode}
        onRunKernel={handleRunKernel}
        isCompiling={isCompiling || localCompiling}
      />
    </div>
  );
};
