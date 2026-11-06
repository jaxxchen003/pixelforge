import { SpriteStudio } from '@/components/blocks/sprite-studio';
import { seo } from '@/lib/seo';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/sprite-sheet-maker/')({
  head: () => {
    return seo('/sprite-sheet-maker', {
      title: 'Free Sprite Sheet Maker & Texture Atlas Packer | PixelForge',
      description: 'Merge animation frames and GIFs into a single packed sprite sheet PNG with standard TextureAtlas JSON metadata for Godot, Unity, and Phaser.'
    });
  },
  component: SpriteStudio,
});
