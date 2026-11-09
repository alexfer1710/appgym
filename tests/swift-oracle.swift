import Foundation
@main struct Oracle {
    struct Query: Decodable { var exercise: Exercise; var grip: String?; var station: CableStation }
    struct Fixture: Decodable { var sessions: [WorkoutSession]; var queries: [Query] }
    @MainActor static func main() throws {
        let f = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
        let result = f.queries.map { q in
            let model = WorkoutViewModel(exercises: [q.exercise], gripSettings: [:], previous: f.sessions)
            model.primaryGroup = q.exercise.group
            model.startWorkout()
            model.select(q.exercise)
            if let grip = q.grip { model.chooseGrip(grip) }
            model.chooseCableStation(q.station)
            return model.weight
        }
        print(String(data: try JSONEncoder().encode(result), encoding: .utf8)!)
    }
}
