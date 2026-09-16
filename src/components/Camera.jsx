import React, { forwardRef } from 'react';

const Camera = forwardRef(function Camera({ stream, mistDensity = 0 }, ref) {
  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden z-0 bg-[#0a0a0f] pointer-events-none select-none">
      {/* 1. Base Layer: Crisp, Unblurred Live Webcam Feed */}
      <video
        ref={ref}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          transform: 'scaleX(-1)', // Mirrored horizontally
        }}
      />

      {/* 2. Frosted Mist Layer: Blurred Video + Milky Veil (faded via mistDensity) */}
      <div
        className="absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-150"
        style={{
          opacity: mistDensity,
        }}
      >
        {/* Blurred copy of the video for the heavy frosted glass effect */}
        <video
          ref={(el) => {
            if (el && stream && el.srcObject !== stream) {
              el.srcObject = stream;
              el.play().catch(() => {});
            }
          }}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            transform: 'scaleX(-1) scale(1.08)',
            filter: 'blur(30px) brightness(1.06) saturate(0.85)',
          }}
        />

        {/* Milky-White Frosted Glass Mist Veil */}
        <div
          className="absolute inset-0 w-full h-full"
          style={{
            backgroundColor: 'rgba(235, 242, 248, 0.44)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          }}
        />
      </div>
    </div>
  );
});

export default Camera;
