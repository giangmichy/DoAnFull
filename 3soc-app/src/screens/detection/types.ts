export type ViolationFrame = {
  frame_number: number;
  timestamp: number;
  image_path: string;
  detections: any[];
};

export type MediaType = 'image' | 'video' | null;
