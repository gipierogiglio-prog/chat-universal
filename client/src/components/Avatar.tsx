import { avatarColor, initials } from "../utils";

export default function Avatar({
  name,
  seed,
  size = 42,
}: {
  name: string;
  seed: string;
  size?: number;
}) {
  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: avatarColor(seed),
      }}
    >
      {initials(name)}
    </div>
  );
}
