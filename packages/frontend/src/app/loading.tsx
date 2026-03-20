export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="flex flex-col items-center space-y-4">
        <div className="relative">
          <div className="w-12 h-12 border-4 border-gray-200 rounded-full"></div>
          <div className="absolute top-0 left-0 w-12 h-12 border-4 border-aws-orange rounded-full border-t-transparent animate-spin"></div>
        </div>
        <p className="text-gray-600 text-sm">Loading...</p>
      </div>
    </div>
  );
}
