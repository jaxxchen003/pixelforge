import { PixelStudio } from '@/components/blocks/pixel-studio';
import { seo } from '@/lib/seo';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  head: () => {
    return seo('/', {
      title: 'Free Image to Pixel Art Converter & Sprite Tool | PixelForge',
      description: 'Convert any image to pixel art in seconds. Zero upload server, instant in-browser pixelation, toggleable grid lines, and classic palettes.'
    });
  },
  component: () => (
    <PixelStudio
      title="Free Image to Pixel Art Converter"
      subtitle="Convert any image to clean, retro pixel art with customizable resolution, palettes, and toggleable grid lines."
      initialResolution={32}
      defaultShowGrid={false}
      pageMode="general"
    />
  ),
});
