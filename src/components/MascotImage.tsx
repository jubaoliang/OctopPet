interface MascotImageProps {
  src: string;
}

export default function MascotImage({ src }: MascotImageProps) {
  return <img className="mascot-image" src={src} alt="Octop 宠物" draggable={false} />;
}
