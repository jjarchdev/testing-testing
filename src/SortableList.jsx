import { useEffect, useRef, useState } from "react";

function moveInArray(list, from, to) {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function scrollParentOf(el) {
  let node = el?.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

export default function SortableList({ items, getKey, onReorder, renderItem, disabled = false, gap = 0, style }) {
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  const nodes = useRef(new Map());
  const itemsRef = useRef(items);
  const reorderRef = useRef(onReorder);
  itemsRef.current = items;
  reorderRef.current = onReorder;
  const stable = useRef(null);

  if (!stable.current) {
    const api = {
      update() {
        const info = dragRef.current;
        if (!info) return;
        const dy = info.lastY - info.startY + (info.scroller.scrollTop - info.scrollStart);
        const center = info.rects[info.from].top + info.rects[info.from].height / 2 + dy;
        let to = 0;
        info.rects.forEach((r, j) => {
          if (j !== info.from && r.top + r.height / 2 < center) to += 1;
        });
        info.to = to;
        setDrag({ key: info.key, from: info.from, to, dy, shift: info.shift });
      },
      tick() {
        const info = dragRef.current;
        if (!info) return;
        const viewport = info.scroller === document.scrollingElement || info.scroller === document.documentElement;
        const rect = viewport ? { top: 0, bottom: window.innerHeight } : info.scroller.getBoundingClientRect();
        const edge = 70;
        let speed = 0;
        if (info.lastY < rect.top + edge) speed = -Math.ceil((rect.top + edge - info.lastY) / 5);
        else if (info.lastY > rect.bottom - edge) speed = Math.ceil((info.lastY - (rect.bottom - edge)) / 5);
        if (speed) {
          info.scroller.scrollTop += Math.max(-26, Math.min(26, speed));
          api.update();
        }
        info.raf = requestAnimationFrame(api.tick);
      },
      onMove(e) {
        const info = dragRef.current;
        if (!info) return;
        info.lastY = e.clientY;
        api.update();
      },
      onUp() {
        api.finish(true);
      },
      onCancel() {
        api.finish(false);
      },
      finish(commit) {
        window.removeEventListener("pointermove", api.onMove);
        window.removeEventListener("pointerup", api.onUp);
        window.removeEventListener("pointercancel", api.onCancel);
        const info = dragRef.current;
        dragRef.current = null;
        if (info) cancelAnimationFrame(info.raf);
        setDrag(null);
        if (commit && info && info.to !== info.from) {
          reorderRef.current(moveInArray(itemsRef.current, info.from, info.to));
        }
      },
    };
    stable.current = api;
  }

  useEffect(() => () => stable.current.finish(false), []);

  const startDrag = (e, key) => {
    if (disabled || dragRef.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const list = itemsRef.current;
    const from = list.findIndex((it) => getKey(it) === key);
    if (from < 0) return;
    e.preventDefault();
    const rects = list.map((it) => {
      const r = nodes.current.get(getKey(it))?.getBoundingClientRect();
      return r ? { top: r.top, height: r.height } : { top: 0, height: 0 };
    });
    const scroller = scrollParentOf(nodes.current.get(key));
    const info = {
      key,
      from,
      to: from,
      rects,
      startY: e.clientY,
      lastY: e.clientY,
      scroller,
      scrollStart: scroller.scrollTop,
      shift: rects[from].height + gap,
      raf: 0,
    };
    dragRef.current = info;
    setDrag({ key, from, to: from, dy: 0, shift: info.shift });
    window.addEventListener("pointermove", stable.current.onMove);
    window.addEventListener("pointerup", stable.current.onUp);
    window.addEventListener("pointercancel", stable.current.onCancel);
    info.raf = requestAnimationFrame(stable.current.tick);
  };

  const moveBy = (key, delta) => {
    const list = itemsRef.current;
    const from = list.findIndex((it) => getKey(it) === key);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= list.length) return;
    const role = document.activeElement?.getAttribute?.("data-sort-role") || null;
    reorderRef.current(moveInArray(list, from, to));
    if (role) {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          nodes.current.get(key)?.querySelector(`[data-sort-role="${role}"]`)?.focus();
        })
      );
    }
  };

  return (
    <div role="list" style={{ display: "flex", flexDirection: "column", gap, ...style }}>
      {items.map((item, index) => {
        const key = getKey(item);
        const isDragging = drag?.key === key;
        let translate = 0;
        if (drag && !isDragging) {
          if (drag.from < drag.to && index > drag.from && index <= drag.to) translate = -drag.shift;
          else if (drag.from > drag.to && index >= drag.to && index < drag.from) translate = drag.shift;
        }
        return (
          <div
            key={key}
            role="listitem"
            ref={(el) => {
              if (el) nodes.current.set(key, el);
              else nodes.current.delete(key);
            }}
            style={{
              position: "relative",
              zIndex: isDragging ? 5 : undefined,
              transform: isDragging ? `translateY(${drag.dy}px)` : translate ? `translateY(${translate}px)` : undefined,
              transition: isDragging ? "none" : drag ? "transform 150ms ease" : undefined,
              boxShadow: isDragging ? "0 10px 28px rgba(0, 0, 0, 0.55)" : undefined,
              outline: isDragging ? "1px solid #4fa3ff" : undefined,
              borderRadius: 10,
              userSelect: drag ? "none" : undefined,
            }}
          >
            {renderItem(item, {
              index,
              count: items.length,
              isDragging,
              handleProps: {
                "data-sort-role": "handle",
                disabled,
                onPointerDown: (e) => startDrag(e, key),
                onKeyDown: (e) => {
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    moveBy(key, -1);
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    moveBy(key, 1);
                  }
                },
              },
              handleStyle: {
                touchAction: "none",
                cursor: disabled ? "default" : isDragging ? "grabbing" : "grab",
              },
              upProps: {
                "data-sort-role": "up",
                disabled: disabled || index === 0,
                onClick: () => moveBy(key, -1),
              },
              downProps: {
                "data-sort-role": "down",
                disabled: disabled || index === items.length - 1,
                onClick: () => moveBy(key, 1),
              },
            })}
          </div>
        );
      })}
    </div>
  );
}
