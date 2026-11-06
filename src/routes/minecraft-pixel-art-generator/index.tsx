import { PixelStudio } from '@/components/blocks/pixel-studio';
import { seo } from '@/lib/seo';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/minecraft-pixel-art-generator/')({
  head: () => {
    return seo('/minecraft-pixel-art-generator', {
      title: 'Minecraft Pixel Art Generator (Blocks & Blueprints) | PixelForge',
      description: 'Convert pictures into Minecraft block pixel art blueprints. Generates an exact block material shopping list (wool, concrete, terracotta, wood).'
    });
  },
  component: () => (
    <PixelStudio
      title="Minecraft Pixel Art Generator"
      subtitle="Turn your images into buildable Minecraft block art. Automatically quantizes to in-game block materials with a full placement grid."
      initialResolution={48}
      initialPalette="minecraft"
      defaultShowGrid={true}
      pageMode="minecraft"
    />
  ),
});
