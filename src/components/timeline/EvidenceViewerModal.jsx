import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Edit3,
  MapPin,
  X,
} from "lucide-react";

export default function EvidenceViewerModal({ state, actions, canEdit = false }) {
  const [videoErrorKey, setVideoErrorKey] = useState(null);
  const {
    modalGroup,
    currentModalPhoto,
    currentModalMemo,
    activeImage,
    isModalImageLoading,
    isEditingModalGroup,
    isEditingModalDetails,
    isSavingModalGroup,
    modalGroupEditTitle,
    modalGroupEditMemo,
    modalGroupEditDate,
    modalGroupEditError,
    isSavingModalDetails,
    modalEditTitle,
    modalEditDate,
    modalEditMemo,
    modalEditError
  } = state;
  const isCurrentVideo =
    currentModalPhoto?.type === "video" ||
    String(currentModalPhoto?.mimeType || "").toLowerCase().startsWith("video/");
  const currentVideoErrorKey = `${currentModalPhoto?.id || ""}:${activeImage || ""}`;
  const {
    setTextNoteBeingEdited,
    setShowTextNoteModal,
    handleCloseModal,
    handleOpenMapLocation,
    handleUngroupCurrentEvidence,
    handleUngroupEntireGroup,
    handleSaveModalGroup,
    handleCancelEditingModalGroup,
    setModalGroupEditTitle,
    setModalGroupEditMemo,
    setModalGroupEditDate,
    handleStartEditingModalGroup,
    handleSaveModalDetails,
    setIsEditingModalDetails,
    setModalEditError,
    setModalEditTitle,
    setModalEditDate,
    setModalEditMemo,
    handleStartEditingModalDetails,
    handleModalNavigate
  } = actions;

  return (
    <>
      {modalGroup && (
        <div
          onClick={handleCloseModal}
          className="cv-evidence-viewer fixed inset-0 z-[70] bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-between p-6 cursor-pointer"
        >
          {/* Modal Header Bar */}
          <div
            className="cv-viewer-header w-full max-w-4xl flex items-center justify-between text-slate-200 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-slate-100">
                {modalGroup.groupTitle || "Evidence Viewer"}
              </span>

              {modalGroup.photos.length > 1 && (
                <span className="text-xs font-mono text-amber-400 bg-slate-900 border border-slate-700 px-2 py-0.5 rounded">
                  {modalGroup.currentIndex + 1} / {modalGroup.photos.length}
                </span>
              )}

              {canEdit && currentModalPhoto?.type === "text_note" && (
                <button
                  onClick={() => {
                    setTextNoteBeingEdited(currentModalPhoto);
                    setShowTextNoteModal(true);
                    handleCloseModal();
                  }}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs rounded flex items-center gap-1 transition cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
                  Edit Text
                </button>
              )}

              {/* Dynamic Location Button for Current Carousel Photo */}
              {currentModalPhoto &&
                (currentModalPhoto.hasGps ||
                  (currentModalPhoto.latitude &&
                    currentModalPhoto.longitude)) && (
                  <button
                    onClick={() => handleOpenMapLocation([currentModalPhoto])}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs rounded flex items-center gap-1 transition cursor-pointer"
                  >
                    <MapPin className="w-3.5 h-3.5 text-amber-400" />
                    Location Data
                  </button>
                )}

              {canEdit && modalGroup.isEventGroup &&
                currentModalPhoto &&
                !isEditingModalGroup &&
                !isEditingModalDetails && (
                  <>
                    <button
                      type="button"
                      onClick={handleUngroupCurrentEvidence}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs rounded transition cursor-pointer"
                      title="Remove this evidence from the group"
                    >
                      Remove from Group
                    </button>
                    <button
                      type="button"
                      onClick={handleUngroupEntireGroup}
                      className="px-2.5 py-1 bg-rose-950/60 hover:bg-rose-900/70 border border-rose-800 text-rose-200 text-xs rounded transition cursor-pointer"
                      title="Return all evidence to the timeline and remove this group"
                    >
                      Ungroup All
                    </button>
                  </>
                )}
            </div>
          </div>

          <button
            onClick={(event) => {
              event.stopPropagation();
              handleCloseModal();
            }}
            className="absolute top-4 right-4 z-30 w-10 h-10 rounded-full bg-slate-900/95 border border-slate-700 text-slate-300 hover:text-white hover:border-amber-500 flex items-center justify-center transition cursor-pointer shadow-xl"
            title="Close Viewer"
            aria-label="Close viewer"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Photo and memo panel share this viewer for both a single photo and a carousel. */}
          <div
            className="cv-viewer-content relative flex-1 min-h-0 w-full max-w-7xl my-3 lg:px-14 flex flex-col lg:flex-row items-stretch justify-center gap-4 lg:gap-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cv-viewer-media relative flex-1 min-h-0 min-w-0 flex items-center justify-center overflow-hidden">
              {isModalImageLoading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />

                  <span className="text-xs text-slate-400 font-mono">
                    {isCurrentVideo ? "Loading video..." : "Loading evidence..."}
                  </span>
                </div>
              ) : currentModalPhoto?.type === "text_note" ? (
                <article className="w-full max-w-3xl max-h-full overflow-auto rounded-xl border border-slate-700 bg-slate-900 p-6 text-slate-200 shadow-2xl whitespace-pre-wrap break-words">
                  {currentModalPhoto.noteContent ||
                    currentModalPhoto.memo ||
                    "(Empty note)"}
                </article>
              ) : isCurrentVideo && videoErrorKey === currentVideoErrorKey ? (
                <div className="flex flex-col items-center gap-3 text-center text-sm text-slate-300">
                  <span>This video format could not be played in this browser.</span>
                  {currentModalPhoto?.webViewLink && (
                    <a
                      href={currentModalPhoto.webViewLink}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-amber-300 hover:bg-slate-700"
                      onClick={(event) => event.stopPropagation()}
                    >
                      Open video in Google Drive
                    </a>
                  )}
                </div>
              ) : activeImage && isCurrentVideo ? (
                <video
                  key={currentVideoErrorKey}
                  src={activeImage}
                  poster={currentModalPhoto?.thumbnailLink || undefined}
                  controls
                  playsInline
                  preload="metadata"
                  className="max-w-full max-h-full rounded-lg shadow-2xl"
                  aria-label={currentModalPhoto?.title || "Video evidence"}
                  onError={() => setVideoErrorKey(currentVideoErrorKey)}
                />
              ) : activeImage ? (
                <img
                  src={activeImage}
                  className="max-w-full max-h-full rounded-lg shadow-2xl object-contain"
                  alt={currentModalPhoto?.title || "Evidence Preview"}
                />
              ) : (
                <div className="text-xs text-slate-400">
                  Failed to render evidence.
                </div>
              )}
            </div>

            {currentModalPhoto &&
              (modalGroup.isEventGroup || currentModalPhoto.type !== "text_note") && (
              <aside className="cv-viewer-details w-full lg:w-80 xl:w-96 h-fit min-h-0 max-h-full self-center shrink-0 overflow-y-auto overscroll-contain rounded-xl border border-slate-700 bg-slate-900/95 p-4 sm:p-5 shadow-2xl text-center">
                {modalGroup.isEventGroup && (
                  <section className="mb-4 border-b border-slate-700 pb-4">
                    {isEditingModalGroup ? (
                      <form
                        onSubmit={handleSaveModalGroup}
                        className="flex flex-col items-center gap-3 text-center"
                      >
                        <div className="relative flex items-center justify-center gap-2">
                          <h2 className="text-sm font-semibold text-slate-100">
                            Edit Group
                          </h2>
                          <button
                            type="button"
                            onClick={handleCancelEditingModalGroup}
                            disabled={isSavingModalGroup}
                            className="absolute right-0 text-xs text-slate-400 hover:text-white disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                        <label className="flex flex-col items-center gap-1 text-center text-[10px] uppercase tracking-wider font-mono text-amber-400">
                          Group Title
                          <input
                            type="text"
                            value={modalGroupEditTitle}
                            onChange={(event) =>
                              setModalGroupEditTitle(event.target.value)
                            }
                            className="w-full normal-case tracking-normal text-center font-sans text-sm text-slate-100 bg-slate-950 border border-slate-700 rounded-md px-2.5 py-2 outline-none focus:border-amber-500"
                          />
                        </label>
                        <label className="flex flex-col items-center gap-1 text-center text-[10px] uppercase tracking-wider font-mono text-amber-400">
                          Group Date &amp; Time
                          <input
                            type="datetime-local"
                            value={modalGroupEditDate}
                            onChange={(event) =>
                              setModalGroupEditDate(event.target.value)
                            }
                            className="w-full normal-case tracking-normal text-center font-sans text-sm text-slate-100 bg-slate-950 border border-slate-700 rounded-md px-2.5 py-2 outline-none focus:border-amber-500"
                          />
                        </label>
                        <label className="w-full flex flex-col items-center gap-1 text-center text-[10px] uppercase tracking-wider font-mono text-amber-400">
                          Group Memo
                          <textarea
                            rows={3}
                            value={modalGroupEditMemo}
                            onChange={(event) =>
                              setModalGroupEditMemo(event.target.value)
                            }
                            className="w-full normal-case tracking-normal text-center font-sans text-sm leading-relaxed text-slate-100 bg-slate-950 border border-slate-700 rounded-md px-2.5 py-2 outline-none focus:border-amber-500 resize-y"
                          />
                        </label>
                        {modalGroupEditError && (
                          <p className="text-xs text-rose-300">
                            {modalGroupEditError}
                          </p>
                        )}
                        <button
                          type="submit"
                          disabled={isSavingModalGroup}
                          className="w-full rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-semibold px-3 py-2 transition disabled:opacity-60"
                        >
                          {isSavingModalGroup ? "Saving..." : "Save Group"}
                        </button>
                      </form>
                    ) : (
                      <>
                        <div className="relative flex items-center justify-center gap-3 text-center">
                          <div className="w-full min-w-0">
                            <p className="text-[10px] uppercase tracking-wider font-mono text-amber-400">
                              Group
                            </p>
                            <h2 className="mt-1 text-sm font-semibold text-slate-100 break-words text-center">
                              {modalGroup.groupTitle || "Untitled Group"}
                            </h2>
                            <p className="mt-1 text-xs text-slate-400 text-center">
                              {modalGroup.groupDateFormatted || "Date unavailable"}
                              {" · "}
                              {modalGroup.groupTimeFormatted || "Time unavailable"}
                            </p>
                          </div>
                          {canEdit && <button
                            type="button"
                            onClick={handleStartEditingModalGroup}
                            className="absolute right-0 text-slate-400 hover:text-amber-400 p-1 rounded hover:bg-slate-800 transition"
                            title="Edit group title, date, time, and memo"
                            aria-label="Edit group title, date, time, and memo"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>}
                        </div>
                        <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                          <h3 className="text-[10px] uppercase tracking-wider font-mono text-amber-400 text-center">
                            Group Memo
                          </h3>
                          <p className="mt-2 text-sm leading-relaxed text-slate-300 whitespace-pre-wrap break-words select-text text-center">
                            {String(modalGroup.groupMemo || "").trim() || (
                              <span className="text-slate-500 italic">
                                No group memo added.
                              </span>
                            )}
                          </p>
                        </div>
                      </>
                    )}
                  </section>
                )}
                {currentModalPhoto.type !== "text_note" && (
                  isEditingModalDetails ? (
                  <form
                    onSubmit={handleSaveModalDetails}
                    className="flex flex-col items-center gap-3 text-center"
                  >
                    <div className="relative flex items-center justify-center gap-2">
                      <h2 className="text-sm font-semibold text-slate-100">
                        Edit Evidence
                      </h2>
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingModalDetails(false);
                          setModalEditError("");
                        }}
                        disabled={isSavingModalDetails}
                        className="absolute right-0 text-xs text-slate-400 hover:text-white disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>

                    <label className="flex flex-col items-center gap-1 text-center text-[10px] uppercase tracking-wider font-mono text-amber-400">
                      Title
                      <input
                        type="text"
                        value={modalEditTitle}
                        onChange={(event) =>
                          setModalEditTitle(event.target.value)
                        }
                        className="w-full normal-case tracking-normal text-center font-sans text-sm text-slate-100 bg-slate-950 border border-slate-700 rounded-md px-2.5 py-2 outline-none focus:border-amber-500"
                      />
                    </label>

                    <label className="flex flex-col items-center gap-1 text-center text-[10px] uppercase tracking-wider font-mono text-amber-400">
                      Date &amp; Time
                      <input
                        type="datetime-local"
                        value={modalEditDate}
                        onChange={(event) =>
                          setModalEditDate(event.target.value)
                        }
                        className="w-full normal-case tracking-normal text-center font-sans text-sm text-slate-100 bg-slate-950 border border-slate-700 rounded-md px-2.5 py-2 outline-none focus:border-amber-500"
                      />
                    </label>

                    <label className="w-full flex flex-col items-center gap-1 text-center text-[10px] uppercase tracking-wider font-mono text-amber-400">
                      Memo
                      <textarea
                        rows={3}
                        value={modalEditMemo}
                        onChange={(event) =>
                          setModalEditMemo(event.target.value)
                        }
                        className="w-full normal-case tracking-normal text-center font-sans text-sm leading-relaxed text-slate-100 bg-slate-950 border border-slate-700 rounded-md px-2.5 py-2 outline-none focus:border-amber-500 resize-y"
                      />
                    </label>

                    {modalEditError && (
                      <p className="text-xs text-rose-300">{modalEditError}</p>
                    )}

                    <button
                      type="submit"
                      disabled={isSavingModalDetails}
                      className="w-full rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-semibold px-3 py-2 transition disabled:opacity-60"
                    >
                      {isSavingModalDetails ? "Saving..." : "Save Changes"}
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="relative flex items-center justify-center gap-3 text-center">
                      <h2 className="text-sm font-semibold text-slate-100 break-words text-center">
                        {currentModalPhoto.title ||
                          currentModalPhoto.name ||
                          "Untitled Evidence"}
                      </h2>
                      {canEdit && <button
                        type="button"
                        onClick={handleStartEditingModalDetails}
                        className="absolute right-0 text-slate-400 hover:text-amber-400 p-1 rounded hover:bg-slate-800 transition"
                        title="Edit title, date, time, and memo"
                        aria-label="Edit evidence details"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>}
                    </div>
                    <p className="mt-1 text-xs text-slate-400 text-center">
                      {currentModalPhoto.dateFormatted} ·{" "}
                      {currentModalPhoto.timeFormatted}
                    </p>
                    <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                      <h3 className="text-[10px] uppercase tracking-wider font-mono text-amber-400 text-center">
                        Photo Memo
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate-300 whitespace-pre-wrap break-words select-text text-center">
                        {currentModalMemo || (
                          <span className="text-slate-500 italic">
                            No memo added.
                          </span>
                        )}
                      </p>
                    </div>
                  </>
                  )
                )}
              </aside>
            )}
          </div>

          {/* Keep navigation controls at the viewport edges, independent of
              the centered image's width. */}
          {modalGroup.photos.length > 1 && !isEditingModalDetails && (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleModalNavigate(
                    modalGroup.currentIndex === 0
                      ? modalGroup.photos.length - 1
                      : modalGroup.currentIndex - 1,
                  );
                }}
                className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-slate-900/90 hover:bg-slate-900 border border-slate-700 text-slate-200 hover:text-amber-400 flex items-center justify-center transition shadow-xl cursor-pointer"
                title="Previous Evidence"
                aria-label="Previous evidence"
              >
                <ChevronLeft className="w-7 h-7" />
              </button>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleModalNavigate(
                    modalGroup.currentIndex === modalGroup.photos.length - 1
                      ? 0
                      : modalGroup.currentIndex + 1,
                  );
                }}
                className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-slate-900/90 hover:bg-slate-900 border border-slate-700 text-slate-200 hover:text-amber-400 flex items-center justify-center transition shadow-xl cursor-pointer"
                title="Next Evidence"
                aria-label="Next evidence"
              >
                <ChevronRight className="w-7 h-7" />
              </button>
            </>
          )}

          {/* Text notes keep their title caption below the note content. */}
          {currentModalPhoto?.type === "text_note" && (
            <div
              className="text-center text-xs text-slate-400 font-mono z-10 truncate max-w-xl"
              onClick={(e) => e.stopPropagation()}
            >
              {currentModalPhoto.title || currentModalPhoto.name || ""}
            </div>
          )}
        </div>
      )}
    </>
  );
}
