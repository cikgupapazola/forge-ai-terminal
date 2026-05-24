export default function NeoLoader({ message = "SYSTEM LOADING..." }: { message?: string }) {
  return (
    <div className="neo-loader-container">
      <div className="neo-loader-box"></div>
      <div className="neo-loader-text">{message}</div>
    </div>
  );
}
