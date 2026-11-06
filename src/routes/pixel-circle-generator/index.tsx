import { CircleStudio } from '@/components/blocks/circle-studio';
import { seo } from '@/lib/seo';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/pixel-circle-generator/')({
  head: () => {
    return seo('/pixel-circle-generator', {
      title: 'Pixel Circle & Sphere Generator (Minecraft & Voxel Blueprints) | PixelForge',
      description: 'Calculate smooth pixel circles and sphere blueprints on a discrete block grid. Build perfect domes, towers, and circles in Minecraft.'
    });
  },
  component: CircleStudio,
});
