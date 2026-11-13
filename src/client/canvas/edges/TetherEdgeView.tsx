import { BaseEdge, getStraightPath, type EdgeProps } from '@xyflow/react';

/**
 * Derived (never persisted) edge that shows a service is hosted by a device.
 * Weaker than a real cable: dotted, muted, non-interactive.
 */
export function TetherEdgeView({ sourceX, sourceY, targetX, targetY }: EdgeProps) {
  const [path] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  return (
    <BaseEdge
      id="tether"
      path={path}
      style={{
        stroke: 'hsl(var(--border-strong))',
        strokeWidth: 1,
        strokeDasharray: '2 5',
        opacity: 0.9,
      }}
      interactionWidth={0}
    />
  );
}
