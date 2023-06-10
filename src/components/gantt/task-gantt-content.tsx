import React, { useEffect, useState } from "react";
import { EventOption } from "../../types/public-types";
import { BarTask } from "../../types/bar-task";
import { Arrow } from "../other/arrow";
import { handleTaskBySVGMouseEvent } from "../../helpers/bar-helper";
import { isKeyboardEvent } from "../../helpers/other-helper";
import { TaskItem } from "../task-item/task-item";
import {
  BarMoveAction,
  GanttContentMoveAction,
  GanttEvent,
} from "../../types/gantt-task-actions";

export type TaskGanttContentProps = {
  tasks: BarTask[];
  dates: Date[];
  ganttEvent: GanttEvent;
  selectedTask: BarTask | undefined;
  rowHeight: number;
  columnWidth: number;
  timeStep: number;
  excludeWeekdays: number[];
  svg?: React.RefObject<SVGSVGElement>;
  svgWidth: number;
  taskHeight: number;
  arrowColor: string;
  arrowIndent: number;
  arrowLineRadius: number;
  arrowLineStroke: number;
  fontSize: string;
  fontFamily: string;
  setGanttEvent: (value: GanttEvent) => void;
  setFailedTask: (value: BarTask | null) => void;
  setSelectedTask: (taskId: string) => void;
} & EventOption;

export const TaskGanttContent: React.FC<TaskGanttContentProps> = ({
  tasks,
  dates,
  ganttEvent,
  selectedTask,
  rowHeight,
  columnWidth,
  timeStep,
  excludeWeekdays,
  svg,
  taskHeight,
  arrowColor,
  arrowIndent,
  arrowLineRadius,
  arrowLineStroke,
  fontFamily,
  fontSize,
  setGanttEvent,
  setFailedTask,
  setSelectedTask,
  onDragChange,
  onDateChange,
  onProgressChange,
  onDoubleClick,
  onClick,
  onDelete,
}) => {
  const point = svg?.current?.createSVGPoint();
  const [xStep, setXStep] = useState(0);
  const [initEventX1Delta, setInitEventX1Delta] = useState(0);
  const [isMoving, setIsMoving] = useState(false);

  // create xStep
  useEffect(() => {
    const dateDelta = (dates[1].getTime() - dates[0].getTime() - (dates[1].getTimezoneOffset() * 60 * 1000) + (dates[0].getTimezoneOffset() * 60 * 1000));
    const newXStep = ((timeStep * columnWidth) / dateDelta);
    setXStep(newXStep);
  }, [columnWidth, dates, timeStep]);

  useEffect(() => {

    const handleMouseMove = async (event: MouseEvent) => {
      const { action, changedTask } = ganttEvent;
      if (!changedTask || !point || !svg?.current) return;
      event.preventDefault();

      point.x = event.clientX;
      const cursor = point.matrixTransform( svg?.current.getScreenCTM()?.inverse() );

      // const { isChanged, changedTask } = handleTaskBySVGMouseEvent(
      const { changedTask: newChangedTask } = handleTaskBySVGMouseEvent(
        cursor.x,
        action as BarMoveAction,
        changedTask,
        xStep,
        timeStep,
        excludeWeekdays,
        initEventX1Delta,
      );

      // DO NOT CHECK FOR `isChanged` - THIS IS BLOCKING DRAG BACK TO ORIGINAL DATE!
      // if (isChanged) {
        setGanttEvent({ action: action, changedTask: newChangedTask });
        if (!!onDragChange) {
          try {
            await onDragChange(newChangedTask);
          } catch (error) {
            // silent fail.
          }
        }
      // }
    };

    const handleMouseUp = async (event: MouseEvent) => {
      const { action, originalSelectedTask, changedTask } = ganttEvent;
      if (!changedTask || !point || !svg?.current || !originalSelectedTask) {
        return;
      }
      event.preventDefault();

      point.x = event.clientX;
      const cursor = point.matrixTransform(svg?.current.getScreenCTM()?.inverse());

      const { changedTask: newChangedTask } = handleTaskBySVGMouseEvent(
        cursor.x,
        action as BarMoveAction,
        changedTask,
        xStep,
        timeStep,
        excludeWeekdays,
        initEventX1Delta,
      );

      const isNotLikeOriginal = ( (originalSelectedTask.start!==newChangedTask.start) || (originalSelectedTask.end!==newChangedTask.end) || (originalSelectedTask.progress!==newChangedTask.progress) );

      // remove listeners
      svg.current.removeEventListener("mousemove", handleMouseMove);
      svg.current.removeEventListener("mouseup", handleMouseUp);
      setGanttEvent({ action: "" });
      setIsMoving(false);

      // custom operation start
      let operationSuccess = true;
      if (!!isNotLikeOriginal) {
        if ( (action==="move"||action==="end"||action==="start") && onDateChange ) {
          try {
            const result = await onDateChange(newChangedTask);
            if (result !== undefined) {
              operationSuccess = result;
            }
          } catch (error) {
            operationSuccess = false;
          }
        } else if (onProgressChange) {
          try {
            const result = await onProgressChange(newChangedTask, newChangedTask.barChildren);
            if (result !== undefined) {
              operationSuccess = result;
            }
          } catch (error) {
            operationSuccess = false;
          }
        }
      }

      // If operation is failed - return old state
      if (!operationSuccess) {
        setFailedTask(originalSelectedTask);
      }
    };

    if (!isMoving && (ganttEvent.action==="move"||ganttEvent.action==="end"||ganttEvent.action==="start"||ganttEvent.action==="progress") && svg?.current) {
      svg.current.addEventListener("mousemove", handleMouseMove);
      svg.current.addEventListener("mouseup", handleMouseUp);
      setIsMoving(true);
    }
  }, [
    ganttEvent,
    xStep,
    initEventX1Delta,
    onProgressChange,
    timeStep,
    excludeWeekdays,
    onDragChange,
    onDateChange,
    svg,
    isMoving,
    point,
    setFailedTask,
    setGanttEvent,
  ]);

  /**
   * Method is Start point of task change
   */
  const handleBarEventStart = async (
    action: GanttContentMoveAction,
    task: BarTask,
    event?: React.MouseEvent | React.KeyboardEvent
  ) => {
    if (!event) {
      if (action === "select") {
        setSelectedTask(task.id);
      }
    }
    // Keyboard events
    else if (isKeyboardEvent(event)) {
      if (action === "delete") {
        if (onDelete) {
          try {
            const result = await onDelete(task);
            if (result !== undefined && result) {
              setGanttEvent({ action, changedTask: task });
            }
          } catch (error) {
            console.error("Error on Delete. " + error);
          }
        }
      }
    }
    // Mouse Events
    else if (action === "mouseenter") {
      if (!ganttEvent.action) {
        setGanttEvent({
          action,
          changedTask: task,
          originalSelectedTask: task,
        });
      }
    } else if (action === "mouseleave") {
      if (ganttEvent.action === "mouseenter") {
        setGanttEvent({ action: "" });
      }
    } else if (action === "dblclick") {
      !!onDoubleClick && onDoubleClick(task);
    } else if (action === "click") {
      !!onClick && onClick(task);
    }
    // Change task event start
    else if (action === "move") {
      if (!svg?.current || !point) return;
      point.x = event.clientX;
      const cursor = point.matrixTransform(
        svg.current.getScreenCTM()?.inverse()
      );
      setInitEventX1Delta(cursor.x - task.x1);
      setGanttEvent({
        action,
        changedTask: task,
        originalSelectedTask: task,
      });
    } else {
      setGanttEvent({
        action,
        changedTask: task,
        originalSelectedTask: task,
      });
    }
  };

  return (
    <g className="content">
      <g className="arrows" fill={arrowColor} stroke={arrowColor}>
        {tasks.map(task => {
          return task.barChildren.map(child => {
            return (
              <Arrow
                key={`Arrow from ${task.id} to ${tasks[child.index].id}`}
                taskFrom={task}
                taskTo={tasks[child.index]}
                rowHeight={rowHeight}
                taskHeight={taskHeight}
                arrowIndent={arrowIndent}
                arrowLineRadius={arrowLineRadius}
                arrowLineStroke={arrowLineStroke}
              />
            );
          });
        })}
      </g>
      <g className="bar" fontFamily={fontFamily} fontSize={fontSize}>
        {tasks.map(task => {
          return (
            <TaskItem
              task={task}
              arrowIndent={arrowIndent}
              taskHeight={taskHeight}
              isProgressChangeable={!!onProgressChange && !task.isDisabled}
              isDateChangeable={!!onDateChange && !task.isDisabled}
              isDelete={!task.isDisabled}
              onEventStart={handleBarEventStart}
              key={task.id}
              isSelected={!!selectedTask && task.id === selectedTask.id}
            />
          );
        })}
      </g>
    </g>
  );
};
