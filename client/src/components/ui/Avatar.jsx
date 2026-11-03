import { initials } from "../../lib/utils";

/**
 * Renders a user avatar from real profile data, falling back to initials
 * when no photo has been uploaded.
 */
const Avatar = ({ user, className = "", sizeClass = "h-9 w-9", textClass = "text-xs" }) => {
  const image = user?.profileImage;
  if (image)
    return (
      <img
        src={image}
        alt=""
        referrerPolicy="no-referrer"
        className={`${sizeClass} ${className} shrink-0 rounded-full object-cover`}
      />
    );
  return (
    <span
      className={`${sizeClass} ${className} grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 ${textClass} font-bold`}
    >
      {initials(user?.displayName || user?.name)}
    </span>
  );
};

export default Avatar;
