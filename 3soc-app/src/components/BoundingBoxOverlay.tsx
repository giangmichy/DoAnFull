import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type DetectionLike = {
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  label?: string;
  model?: string;
  confidence?: number;
  score?: number;
};

type Size = {
  width: number;
  height: number;
};

type NormalizedBox = {
  x1: number;
  y1: number;
  width: number;
  height: number;
  label: string;
  confidence: number;
};

type BoundingBoxOverlayProps = {
  detections: DetectionLike[];
  containerSize: Size;
  sourceSize: Size;
  colorMap?: Record<string, string>;
  labelMap?: Record<string, string>;
};

const defaultColorMap: Record<string, string> = {
  co3soc: '#ef4444',
  duongluoibo: '#22c55e',
  vnmap: '#3b82f6',
};

function normalizeDetectionBox(det: DetectionLike): NormalizedBox {
  const x1 = Number(det.x1 ?? det.x ?? 0);
  const y1 = Number(det.y1 ?? det.y ?? 0);
  const x2 = Number(det.x2 ?? (x1 + Number(det.width ?? 0)));
  const y2 = Number(det.y2 ?? (y1 + Number(det.height ?? 0)));

  return {
    x1,
    y1,
    width: Math.max(0, x2 - x1),
    height: Math.max(0, y2 - y1),
    label: String(det.label ?? det.model ?? 'object'),
    confidence: Number(det.confidence ?? det.score ?? 0),
  };
}

export default function BoundingBoxOverlay({
  detections,
  containerSize,
  sourceSize,
  colorMap = defaultColorMap,
  labelMap,
}: BoundingBoxOverlayProps) {
  if (!detections.length) return null;
  if (!containerSize.width || !containerSize.height) return null;
  if (!sourceSize.width || !sourceSize.height) return null;

  const sourceAspect = sourceSize.width / sourceSize.height;
  const containerAspect = containerSize.width / containerSize.height;

  let renderedWidth = 0;
  let renderedHeight = 0;
  let offsetX = 0;
  let offsetY = 0;

  if (sourceAspect > containerAspect) {
    renderedWidth = containerSize.width;
    renderedHeight = renderedWidth / sourceAspect;
    offsetY = (containerSize.height - renderedHeight) / 2;
  } else {
    renderedHeight = containerSize.height;
    renderedWidth = renderedHeight * sourceAspect;
    offsetX = (containerSize.width - renderedWidth) / 2;
  }

  const scaleX = renderedWidth / sourceSize.width;
  const scaleY = renderedHeight / sourceSize.height;

  return (
    <View pointerEvents="none" style={styles.overlay}>
      {detections.map((rawBox, idx) => {
        const box = normalizeDetectionBox(rawBox);
        if (box.width <= 0 || box.height <= 0) return null;

        const left = offsetX + box.x1 * scaleX;
        const top = offsetY + box.y1 * scaleY;
        const width = box.width * scaleX;
        const height = box.height * scaleY;
        const color = colorMap[box.label] || '#ef4444';
        const score = box.confidence <= 1 ? box.confidence * 100 : box.confidence;
        const displayLabel = labelMap?.[box.label] || box.label;

        return (
          <View
            key={`${box.label}-${idx}`}
            style={[styles.rect, { left, top, width, height, borderColor: color }]}
          >
            <View style={[styles.labelBg, { backgroundColor: color }]}>
              <Text style={styles.labelText}>{displayLabel} {score.toFixed(1)}%</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  rect: {
    position: 'absolute',
    borderWidth: 2,
  },
  labelBg: {
    position: 'absolute',
    top: -22,
    left: 0,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  labelText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
});
