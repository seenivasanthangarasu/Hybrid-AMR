/** Map service — subscribes to /map (nav_msgs/msg/OccupancyGrid from slam_toolbox) */
import { rosBridgeService } from '../ros/connection'

interface OccupancyCell { x: number; y: number; value: number }
interface MapInfo { width: number; height: number; resolution: number; originX: number; originY: number; originAngle: number }

export function subscribeMap(callback: (data: { info: MapInfo; cells: OccupancyCell[] }) => void): () => void {
  const sub = rosBridgeService.subscribe('/map', (rawMsg: unknown) => {
    if (!rawMsg || typeof rawMsg !== 'object') return
    const m = rawMsg as Record<string, unknown>
    const infoObj = m['info'] as Record<string, unknown> | undefined
    const dataArr = m['data'] as number[] | undefined
    if (!infoObj || !dataArr) return

    callback({
      info: { width: (infoObj['width'] as number) ?? 0, height: (infoObj['height'] as number) ?? 0, resolution: (infoObj['resolution'] as number) ?? 0.05, originX: ((infoObj['origin'] as Record<string, unknown>)?.['x'] as number) ?? 0, originY: ((infoObj['origin'] as Record<string, unknown>)?.['y'] as number) ?? 0, originAngle: ((infoObj['origin'] as Record<string, unknown>)?.['z'] as number) ?? 0 },
      cells: dataArr.map((v, i) => ({ x: i, y: Math.floor(i / (infoObj['width'] as number)), value: v })),
    })
  })

  return () => { sub.unsubscribe() }
}
